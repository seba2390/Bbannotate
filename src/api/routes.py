"""FastAPI routes for the annotation API."""

from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse

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

# Default directories
PROJECTS_DIR = Path("./projects")
DATA_DIR = Path("./data")  # Legacy fallback

# Global state for current project
_current_project_id: str | None = None


def get_project_service() -> ProjectService:
    """Dependency for project service."""
    return ProjectService(PROJECTS_DIR)


def get_annotation_service() -> AnnotationService:
    """Dependency for annotation service - uses current project's data directory."""
    global _current_project_id
    if _current_project_id:
        project_service = ProjectService(PROJECTS_DIR)
        data_dir = project_service.get_project_data_dir(_current_project_id)
        if data_dir:
            return AnnotationService(data_dir)
    # Fallback to legacy data directory
    return AnnotationService(DATA_DIR)


def get_export_service(
    annotation_service: Annotated[AnnotationService, Depends(get_annotation_service)],
) -> ExportService:
    """Dependency for export service."""
    return ExportService(annotation_service)


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
) -> Project | None:
    """Get the currently active project."""
    global _current_project_id
    if not _current_project_id:
        return None
    return service.get_project(_current_project_id)


@router.post("/projects/{project_id}/open", response_model=Project)
def open_project(
    project_id: str,
    service: Annotated[ProjectService, Depends(get_project_service)],
) -> Project:
    """Open a project (set as current and update last_opened)."""
    global _current_project_id
    project = service.open_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    _current_project_id = project_id
    return project


@router.post("/projects/close")
def close_project() -> dict[str, bool]:
    """Close the current project."""
    global _current_project_id
    _current_project_id = None
    return {"success": True}


@router.delete("/projects/{project_id}")
def delete_project(
    project_id: str,
    service: Annotated[ProjectService, Depends(get_project_service)],
) -> dict[str, bool]:
    """Delete a project and all its data."""
    global _current_project_id
    success = service.delete_project(project_id)
    if not success:
        raise HTTPException(status_code=404, detail="Project not found")
    if _current_project_id == project_id:
        _current_project_id = None
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
async def upload_image(
    file: UploadFile = File(...),
    service: AnnotationService = Depends(get_annotation_service),
) -> ImageInfo:
    """Upload a new image."""
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
    train_split: Annotated[float, Query(ge=0.1, le=0.99)] = 0.8,
) -> FileResponse:
    """Export annotations in YOLO format as a ZIP file."""
    zip_path = export_service.export_yolo_zip(train_split)
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
