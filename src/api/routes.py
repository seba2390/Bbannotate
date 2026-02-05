"""FastAPI routes for the annotation API."""

import os
from pathlib import Path
from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    File,
    Header,
    HTTPException,
    Query,
    Request,
    UploadFile,
)
from fastapi.responses import FileResponse
from slowapi import Limiter
from slowapi.util import get_remote_address

from src.models.annotations import (
    Annotation,
    AnnotationCreate,
    AnnotationUpdate,
    ImageInfo,
    ProjectInfo,
)
from src.services.annotation_service import AnnotationService
from src.services.export_service import ExportService
from src.services.project_service import Project, ProjectCreate, ProjectService

router = APIRouter()

# Rate limiter for upload protection
# Default: 30 uploads per minute per IP (configurable via env)
_upload_rate_limit = os.environ.get("BBANNOTATE_UPLOAD_RATE_LIMIT", "30/minute")
limiter = Limiter(key_func=get_remote_address)


def get_projects_dir() -> Path:
    """Get the projects directory from environment or default."""
    env_path = os.environ.get("BBANNOTATE_PROJECTS_DIR")
    if env_path:
        return Path(env_path)
    return Path.cwd() / "projects"


def get_data_dir() -> Path:
    """Get the data directory from environment or default."""
    env_path = os.environ.get("BBANNOTATE_DATA_DIR")
    if env_path:
        return Path(env_path)
    return Path.cwd() / "data"


# Default directories (use functions for dynamic resolution)
PROJECTS_DIR = get_projects_dir()
DATA_DIR = get_data_dir()  # Legacy fallback


def get_project_service() -> ProjectService:
    """Dependency for project service."""
    return ProjectService(get_projects_dir())


def get_project_id_from_header(
    x_project_id: Annotated[str | None, Header()] = None,
) -> str | None:
    """Extract project ID from X-Project-Id header.

    This replaces the previous global state approach, making the API
    thread-safe and suitable for multi-user deployments.
    """
    return x_project_id


def get_annotation_service(
    project_id: Annotated[str | None, Depends(get_project_id_from_header)],
) -> AnnotationService:
    """Dependency for annotation service - uses project from request header.

    Args:
        project_id: Project ID from X-Project-Id header.

    Returns:
        AnnotationService configured for the specified project.
    """
    if project_id:
        project_service = ProjectService(get_projects_dir())
        data_dir = project_service.get_project_data_dir(project_id)
        if data_dir:
            return AnnotationService(data_dir)
    # Fallback to legacy data directory
    return AnnotationService(get_data_dir())


def get_export_service(
    annotation_service: Annotated[AnnotationService, Depends(get_annotation_service)],
) -> ExportService:
    """Dependency for export service."""
    return ExportService(annotation_service)


# Health check endpoint
@router.get("/health")
def health_check() -> dict[str, str]:
    """Health check endpoint for API availability."""
    return {"status": "healthy", "api": "ready"}


# Project management endpoints
@router.get("/projects", response_model=list[Project])
def list_projects(
    service: Annotated[ProjectService, Depends(get_project_service)],
) -> list[Project]:
    """List all projects, sorted by last opened."""
    return service.list_projects()


@router.post("/projects", response_model=Project)
def create_project(
    create: ProjectCreate,
    service: Annotated[ProjectService, Depends(get_project_service)],
) -> Project:
    """Create a new project."""
    return service.create_project(create)


@router.get("/projects/current", response_model=Project | None)
def get_current_project(
    service: Annotated[ProjectService, Depends(get_project_service)],
    project_id: Annotated[str | None, Depends(get_project_id_from_header)],
) -> Project | None:
    """Get the currently active project from X-Project-Id header."""
    if not project_id:
        return None
    return service.get_project(project_id)


@router.post("/projects/{project_id}/open", response_model=Project)
def open_project(
    project_id: str,
    service: Annotated[ProjectService, Depends(get_project_service)],
) -> Project:
    """Open a project and update last_opened timestamp.

    The client should store the returned project ID and include it
    in subsequent requests via the X-Project-Id header.
    """
    project = service.open_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.post("/projects/close")
def close_project() -> dict[str, bool]:
    """Close the current project.

    This is now a no-op on the server side since project context
    is managed per-request via headers. Kept for API compatibility.
    """
    return {"success": True}


@router.delete("/projects/{project_id}")
def delete_project(
    project_id: str,
    service: Annotated[ProjectService, Depends(get_project_service)],
) -> dict[str, bool]:
    """Delete a project and all its data."""
    success = service.delete_project(project_id)
    if not success:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"success": True}


# Project endpoints (existing)
@router.get("/project", response_model=ProjectInfo)
def get_project_info(
    service: Annotated[AnnotationService, Depends(get_annotation_service)],
) -> ProjectInfo:
    """Get project statistics and label information."""
    return service.get_project_info()


# Image endpoints
@router.get("/images", response_model=list[str])
def list_images(
    service: Annotated[AnnotationService, Depends(get_annotation_service)],
) -> list[str]:
    """List all images in the project."""
    return service.list_images()


@router.post("/images", response_model=ImageInfo)
@limiter.limit(_upload_rate_limit)
async def upload_image(
    request: Request,
    file: Annotated[UploadFile, File(...)],
    service: Annotated[AnnotationService, Depends(get_annotation_service)],
) -> ImageInfo:
    """Upload a new image.

    Rate limited to prevent abuse (default: 30/minute per IP).
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")

    content = await file.read()
    try:
        return service.upload_image(file.filename, content)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.get("/images/{filename}")
def get_image(
    filename: str,
    service: Annotated[AnnotationService, Depends(get_annotation_service)],
) -> FileResponse:
    """Get an image file."""
    path = service.get_image_path(filename)
    if path is None:
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(path)


@router.delete("/images/{filename}")
def delete_image(
    filename: str,
    service: Annotated[AnnotationService, Depends(get_annotation_service)],
) -> dict[str, bool]:
    """Delete an image and its annotations."""
    success = service.delete_image(filename)
    if not success:
        raise HTTPException(status_code=404, detail="Image not found")
    return {"success": True}


@router.patch("/images/{filename}/done")
def mark_image_done(
    filename: str,
    service: Annotated[AnnotationService, Depends(get_annotation_service)],
    done: Annotated[bool, Query(description="Mark image as done")] = True,
) -> dict[str, bool]:
    """Mark an image as done (annotation complete)."""
    success = service.mark_image_done(filename, done)
    if not success:
        raise HTTPException(status_code=404, detail="Image not found")
    return {"success": True, "done": done}


@router.get("/images/{filename}/done")
def get_image_done_status(
    filename: str,
    service: Annotated[AnnotationService, Depends(get_annotation_service)],
) -> dict[str, bool]:
    """Get the done status of an image."""
    done = service.get_image_done_status(filename)
    if done is None:
        raise HTTPException(status_code=404, detail="Image not found")
    return {"done": done}


@router.get("/images/done-status", response_model=dict[str, bool])
def get_all_done_status(
    service: Annotated[AnnotationService, Depends(get_annotation_service)],
) -> dict[str, bool]:
    """Get done status for all images."""
    return service.get_all_done_status()


# Annotation endpoints
@router.get("/images/{filename}/annotations", response_model=list[Annotation])
def get_annotations(
    filename: str,
    service: Annotated[AnnotationService, Depends(get_annotation_service)],
) -> list[Annotation]:
    """Get all annotations for an image."""
    return service.get_annotations(filename)


@router.post("/images/{filename}/annotations", response_model=Annotation)
def add_annotation(
    filename: str,
    annotation: AnnotationCreate,
    service: Annotated[AnnotationService, Depends(get_annotation_service)],
) -> Annotation:
    """Add a new annotation to an image."""
    try:
        return service.add_annotation(filename, annotation)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.put("/images/{filename}/annotations/{annotation_id}", response_model=Annotation)
def update_annotation(
    filename: str,
    annotation_id: str,
    update: AnnotationUpdate,
    service: Annotated[AnnotationService, Depends(get_annotation_service)],
) -> Annotation:
    """Update an existing annotation."""
    result = service.update_annotation(filename, annotation_id, update)
    if result is None:
        raise HTTPException(status_code=404, detail="Annotation not found")
    return result


@router.delete("/images/{filename}/annotations/{annotation_id}")
def delete_annotation(
    filename: str,
    annotation_id: str,
    service: Annotated[AnnotationService, Depends(get_annotation_service)],
) -> dict[str, bool]:
    """Delete an annotation."""
    success = service.delete_annotation(filename, annotation_id)
    if not success:
        raise HTTPException(status_code=404, detail="Annotation not found")
    return {"success": True}


@router.delete("/images/{filename}/annotations")
def clear_annotations(
    filename: str,
    service: Annotated[AnnotationService, Depends(get_annotation_service)],
) -> dict[str, int]:
    """Clear all annotations for an image."""
    count = service.clear_annotations(filename)
    return {"deleted": count}


@router.post("/images/{filename}/annotations/copy-from/{source_filename}")
def copy_annotations(
    filename: str,
    source_filename: str,
    service: Annotated[AnnotationService, Depends(get_annotation_service)],
) -> dict[str, int]:
    """Copy annotations from another image."""
    count = service.copy_annotations(source_filename, filename)
    return {"copied": count}


# Export endpoints
@router.post("/export/yolo")
def export_yolo(
    export_service: Annotated[ExportService, Depends(get_export_service)],
    train_split: Annotated[float, Query(ge=0.1, le=0.98)] = 0.7,
    val_split: Annotated[float, Query(ge=0.01, le=0.5)] = 0.2,
    test_split: Annotated[float, Query(ge=0.0, le=0.5)] = 0.1,
) -> FileResponse:
    """Export annotations in YOLO format as a ZIP file."""
    zip_path = export_service.export_yolo_zip(train_split, val_split, test_split)
    return FileResponse(
        zip_path,
        media_type="application/zip",
        filename="yolo_dataset.zip",
    )


@router.post("/export/coco")
def export_coco(
    export_service: Annotated[ExportService, Depends(get_export_service)],
    annotation_service: Annotated[AnnotationService, Depends(get_annotation_service)],
) -> FileResponse:
    """Export annotations in COCO JSON format."""
    output_path = annotation_service.data_dir / "coco_annotations.json"
    export_service.export_coco(output_path)
    return FileResponse(
        output_path,
        media_type="application/json",
        filename="coco_annotations.json",
    )


@router.post("/export/pascal-voc")
def export_pascal_voc(
    export_service: Annotated[ExportService, Depends(get_export_service)],
) -> FileResponse:
    """Export annotations in Pascal VOC XML format as a ZIP file."""
    zip_path = export_service.export_pascal_voc_zip()
    return FileResponse(
        zip_path,
        media_type="application/zip",
        filename="pascal_voc_dataset.zip",
    )


@router.post("/export/createml")
def export_createml(
    export_service: Annotated[ExportService, Depends(get_export_service)],
    annotation_service: Annotated[AnnotationService, Depends(get_annotation_service)],
) -> FileResponse:
    """Export annotations in Apple CreateML JSON format."""
    output_path = annotation_service.data_dir / "createml_annotations.json"
    export_service.export_createml(output_path)
    return FileResponse(
        output_path,
        media_type="application/json",
        filename="createml_annotations.json",
    )


@router.post("/export/csv")
def export_csv(
    export_service: Annotated[ExportService, Depends(get_export_service)],
    annotation_service: Annotated[AnnotationService, Depends(get_annotation_service)],
) -> FileResponse:
    """Export annotations in CSV format."""
    output_path = annotation_service.data_dir / "annotations.csv"
    export_service.export_csv(output_path)
    return FileResponse(
        output_path,
        media_type="text/csv",
        filename="annotations.csv",
    )
