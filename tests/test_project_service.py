"""Tests for the project service."""

import json
from pathlib import Path

import pytest

from src.services.project_service import Project, ProjectCreate, ProjectService


class TestProjectService:
    """Tests for ProjectService class."""

    @pytest.fixture
    def temp_projects_dir(self, tmp_path: Path) -> Path:
        """Create a temporary projects directory."""
        projects_dir = tmp_path / "projects"
        projects_dir.mkdir()
        return projects_dir

    @pytest.fixture
    def service(self, temp_projects_dir: Path) -> ProjectService:
        """Create a project service with a temp directory."""
        return ProjectService(temp_projects_dir)

    def test_create_project(self, service: ProjectService) -> None:
        """Test creating a new project."""
        create = ProjectCreate(name="Test Project")
        project = service.create_project(create)

        assert project.name == "Test Project"
        assert project.id.startswith("test_project_")
        assert project.image_count == 0
        assert project.annotation_count == 0

        # Verify directory structure
        project_dir = service.base_dir / project.id
        assert project_dir.exists()
        assert (project_dir / "images").exists()
        assert (project_dir / "annotations").exists()
        assert (project_dir / "project.json").exists()

    def test_list_projects_empty(self, service: ProjectService) -> None:
        """Test listing projects when empty."""
        projects = service.list_projects()
        assert projects == []

    def test_list_projects_with_projects(self, service: ProjectService) -> None:
        """Test listing multiple projects."""
        import time

        service.create_project(ProjectCreate(name="Project A"))
        time.sleep(0.1)  # Ensure different timestamps on Windows (needs ~100ms)
        service.create_project(ProjectCreate(name="Project B"))

        projects = service.list_projects()
        assert len(projects) == 2
        # Should be sorted by last_opened (most recent first)
        assert projects[0].name == "Project B"
        assert projects[1].name == "Project A"

    def test_get_project(self, service: ProjectService) -> None:
        """Test getting a project by ID."""
        create = ProjectCreate(name="My Project")
        created = service.create_project(create)

        project = service.get_project(created.id)
        assert project is not None
        assert project.id == created.id
        assert project.name == "My Project"

    def test_get_project_not_found(self, service: ProjectService) -> None:
        """Test getting a non-existent project."""
        project = service.get_project("nonexistent")
        assert project is None

    def test_open_project(self, service: ProjectService) -> None:
        """Test opening a project updates last_opened."""
        created = service.create_project(ProjectCreate(name="Test"))
        original_last_opened = created.last_opened

        # Wait a tiny bit to ensure timestamp changes
        import time

        time.sleep(0.01)

        opened = service.open_project(created.id)
        assert opened is not None
        assert opened.last_opened >= original_last_opened

    def test_open_project_not_found(self, service: ProjectService) -> None:
        """Test opening a non-existent project."""
        result = service.open_project("nonexistent")
        assert result is None

    def test_delete_project(self, service: ProjectService) -> None:
        """Test deleting a project."""
        created = service.create_project(ProjectCreate(name="To Delete"))
        project_dir = service.base_dir / created.id
        assert project_dir.exists()

        success = service.delete_project(created.id)
        assert success is True
        assert not project_dir.exists()

    def test_delete_project_not_found(self, service: ProjectService) -> None:
        """Test deleting a non-existent project."""
        success = service.delete_project("nonexistent")
        assert success is False

    def test_get_project_data_dir(self, service: ProjectService) -> None:
        """Test getting project data directory."""
        created = service.create_project(ProjectCreate(name="Test"))

        data_dir = service.get_project_data_dir(created.id)
        assert data_dir is not None
        assert data_dir.exists()

    def test_get_project_data_dir_not_found(self, service: ProjectService) -> None:
        """Test getting data directory for non-existent project."""
        data_dir = service.get_project_data_dir("nonexistent")
        assert data_dir is None

    def test_project_stats_counted(self, service: ProjectService) -> None:
        """Test that project stats are counted correctly."""
        created = service.create_project(ProjectCreate(name="Stats Test"))

        # Add some fake annotation data
        annotations_dir = service.base_dir / created.id / "annotations"
        annotation_file = annotations_dir / "test.json"
        annotation_data = {
            "image": {"filename": "test.jpg", "width": 100, "height": 100},
            "annotations": [
                {
                    "id": "1",
                    "label": "product",
                    "class_id": 0,
                    "bbox": {"x": 0.5, "y": 0.5, "width": 0.1, "height": 0.1},
                },
                {
                    "id": "2",
                    "label": "price",
                    "class_id": 1,
                    "bbox": {"x": 0.3, "y": 0.3, "width": 0.1, "height": 0.1},
                },
            ],
        }
        with annotation_file.open("w") as f:
            json.dump(annotation_data, f)

        # Add a fake image
        images_dir = service.base_dir / created.id / "images"
        (images_dir / "test.jpg").touch()

        project = service.get_project(created.id)
        assert project is not None
        assert project.image_count == 1
        assert project.annotation_count == 2

    def test_project_id_sanitization(self, service: ProjectService) -> None:
        """Test that project names with special chars are sanitized."""
        create = ProjectCreate(name="Test / Project @ 123!")
        project = service.create_project(create)

        # ID should not contain special characters
        assert "/" not in project.id
        assert "@" not in project.id
        assert "!" not in project.id
        assert " " not in project.id


class TestProjectModel:
    """Tests for the Project model."""

    def test_project_creation(self) -> None:
        """Test creating a project model."""
        project = Project(
            id="test_20240101_120000",
            name="Test Project",
            created_at="2024-01-01T12:00:00",
            last_opened="2024-01-01T12:00:00",
            image_count=5,
            annotation_count=10,
        )

        assert project.id == "test_20240101_120000"
        assert project.name == "Test Project"
        assert project.image_count == 5
        assert project.annotation_count == 10

    def test_project_serialization(self) -> None:
        """Test project serialization to dict."""
        project = Project(
            id="test_id",
            name="My Project",
            created_at="2024-01-01T12:00:00",
            last_opened="2024-01-02T14:00:00",
        )

        data = project.model_dump()
        assert data["id"] == "test_id"
        assert data["name"] == "My Project"
        assert data["image_count"] == 0
        assert data["annotation_count"] == 0


class TestProjectCreate:
    """Tests for the ProjectCreate model."""

    def test_valid_project_create(self) -> None:
        """Test valid project create."""
        create = ProjectCreate(name="New Project")
        assert create.name == "New Project"

    def test_empty_name_fails(self) -> None:
        """Test that empty name fails validation."""
        with pytest.raises(ValueError):
            ProjectCreate(name="")

    def test_long_name_fails(self) -> None:
        """Test that too long name fails validation."""
        with pytest.raises(ValueError):
            ProjectCreate(name="x" * 101)
