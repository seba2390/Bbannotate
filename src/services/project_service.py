"""Service for managing annotation projects."""

import json
import shutil
from datetime import datetime
from pathlib import Path

from pydantic import BaseModel, Field


class Project(BaseModel):
    """Represents an annotation project."""

    id: str = Field(..., description="Unique project identifier (directory name)")
    name: str = Field(..., description="Human-readable project name")
    created_at: str = Field(..., description="ISO format creation timestamp")
    last_opened: str = Field(..., description="ISO format last opened timestamp")
    image_count: int = Field(default=0, description="Number of images in project")
    annotation_count: int = Field(default=0, description="Total number of annotations")


class ProjectCreate(BaseModel):
    """Request model for creating a project."""

    name: str = Field(..., min_length=1, max_length=100, description="Project name")


class ProjectService:
    """Handles project storage and management."""

    def __init__(self, base_dir: Path) -> None:
        """Initialize the project service.

        Args:
            base_dir: Base directory for storing all projects.
        """
        self.base_dir = base_dir
        self._ensure_directories()

    def _ensure_directories(self) -> None:
        """Create base projects directory if it doesn't exist."""
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def _get_project_dir(self, project_id: str) -> Path:
        """Get the directory path for a project."""
        return self.base_dir / project_id

    def _get_project_meta_path(self, project_id: str) -> Path:
        """Get the path to the project metadata file."""
        return self._get_project_dir(project_id) / "project.json"

    def _generate_project_id(self, name: str) -> str:
        """Generate a unique project ID from name and timestamp."""
        # Sanitize name for use in directory
        sanitized = "".join(
            c if c.isalnum() or c in "-_" else "_" for c in name.lower()
        )
        sanitized = sanitized[:50]  # Limit length
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        return f"{sanitized}_{timestamp}"

    def _load_project_meta(self, project_id: str) -> Project | None:
        """Load project metadata from JSON file."""
        meta_path = self._get_project_meta_path(project_id)
        if not meta_path.exists():
            return None
        with meta_path.open("r") as f:
            data = json.load(f)
        return Project.model_validate(data)

    def _save_project_meta(self, project: Project) -> None:
        """Save project metadata to JSON file."""
        meta_path = self._get_project_meta_path(project.id)
        with meta_path.open("w") as f:
            json.dump(project.model_dump(), f, indent=2)

    def _count_project_stats(self, project_id: str) -> tuple[int, int]:
        """Count images and annotations in a project.

        Returns:
            Tuple of (image_count, annotation_count).
        """
        project_dir = self._get_project_dir(project_id)
        images_dir = project_dir / "images"
        annotations_dir = project_dir / "annotations"

        image_count = 0
        annotation_count = 0

        if images_dir.exists():
            extensions = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
            for img_path in images_dir.iterdir():
                if img_path.suffix.lower() in extensions:
                    image_count += 1

        if annotations_dir.exists():
            for ann_path in annotations_dir.glob("*.json"):
                with ann_path.open("r") as f:
                    data = json.load(f)
                annotations = data.get("annotations", [])
                annotation_count += len(annotations)

        return image_count, annotation_count

    def list_projects(self) -> list[Project]:
        """List all projects, sorted by last opened (most recent first)."""
        projects = []

        for project_dir in self.base_dir.iterdir():
            if not project_dir.is_dir():
                continue
            project = self._load_project_meta(project_dir.name)
            if project:
                # Update counts
                image_count, annotation_count = self._count_project_stats(project.id)
                project.image_count = image_count
                project.annotation_count = annotation_count
                projects.append(project)

        # Sort by last_opened, most recent first
        projects.sort(key=lambda p: p.last_opened, reverse=True)
        return projects

    def create_project(self, create: ProjectCreate) -> Project:
        """Create a new project.

        Args:
            create: Project creation request.

        Returns:
            The created project.
        """
        project_id = self._generate_project_id(create.name)
        project_dir = self._get_project_dir(project_id)

        # Create project directories
        project_dir.mkdir(parents=True, exist_ok=True)
        (project_dir / "images").mkdir(exist_ok=True)
        (project_dir / "annotations").mkdir(exist_ok=True)

        now = datetime.now().isoformat()
        project = Project(
            id=project_id,
            name=create.name,
            created_at=now,
            last_opened=now,
            image_count=0,
            annotation_count=0,
        )

        self._save_project_meta(project)
        return project

    def get_project(self, project_id: str) -> Project | None:
        """Get a project by ID."""
        project = self._load_project_meta(project_id)
        if project:
            image_count, annotation_count = self._count_project_stats(project_id)
            project.image_count = image_count
            project.annotation_count = annotation_count
        return project

    def open_project(self, project_id: str) -> Project | None:
        """Open a project and update its last_opened timestamp.

        Returns:
            The project if found, None otherwise.
        """
        project = self._load_project_meta(project_id)
        if not project:
            return None

        # Update last_opened
        project.last_opened = datetime.now().isoformat()
        image_count, annotation_count = self._count_project_stats(project_id)
        project.image_count = image_count
        project.annotation_count = annotation_count

        self._save_project_meta(project)
        return project

    def delete_project(self, project_id: str) -> bool:
        """Delete a project and all its data.

        Returns:
            True if deleted, False if not found.
        """
        project_dir = self._get_project_dir(project_id)
        if not project_dir.exists():
            return False

        shutil.rmtree(project_dir)
        return True

    def get_project_data_dir(self, project_id: str) -> Path | None:
        """Get the data directory for a project.

        This is the directory that should be passed to AnnotationService.
        """
        project_dir = self._get_project_dir(project_id)
        if not project_dir.exists():
            return None
        return project_dir
