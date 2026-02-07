"""Tests for the AnnotationService."""

import io
import json
import tempfile
from pathlib import Path

import pytest
from PIL import Image

from src.models.annotations import AnnotationCreate, AnnotationUpdate, BoundingBox
from src.services.annotation_service import AnnotationService


@pytest.fixture
def temp_data_dir() -> Path:
    """Create temporary data directory for testing."""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield Path(tmpdir)


@pytest.fixture
def service(temp_data_dir: Path) -> AnnotationService:
    """Create annotation service with temp directory."""
    return AnnotationService(temp_data_dir)


@pytest.fixture
def sample_image_bytes() -> bytes:
    """Create sample image bytes."""
    img = Image.new("RGB", (100, 100), color="red")
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return buffer.getvalue()


@pytest.fixture
def sample_jpeg_bytes() -> bytes:
    """Create sample JPEG image bytes."""
    img = Image.new("RGB", (200, 150), color="blue")
    buffer = io.BytesIO()
    img.save(buffer, format="JPEG")
    return buffer.getvalue()


class TestAnnotationServiceInit:
    """Tests for AnnotationService initialization."""

    def test_creates_directories(self, temp_data_dir: Path) -> None:
        """Test that service creates necessary directories."""
        service = AnnotationService(temp_data_dir)
        assert service.data_dir.exists()
        assert service.images_dir.exists()
        assert service.annotations_dir.exists()

    def test_handles_existing_directories(self, temp_data_dir: Path) -> None:
        """Test that service works with existing directories."""
        images_dir = temp_data_dir / "images"
        images_dir.mkdir(parents=True)
        service = AnnotationService(temp_data_dir)
        assert service.images_dir.exists()


class TestImageOperations:
    """Tests for image upload, list, get, and delete."""

    def test_list_images_empty(self, service: AnnotationService) -> None:
        """Test listing images when none exist."""
        images = service.list_images()
        assert images == []

    def test_upload_image(
        self, service: AnnotationService, sample_image_bytes: bytes
    ) -> None:
        """Test uploading an image."""
        info = service.upload_image("test.png", sample_image_bytes)
        assert info.filename == "test.png"
        assert info.width == 100
        assert info.height == 100

    def test_upload_image_jpeg(
        self, service: AnnotationService, sample_jpeg_bytes: bytes
    ) -> None:
        """Test uploading a JPEG image."""
        info = service.upload_image("test.jpg", sample_jpeg_bytes)
        assert info.filename == "test.jpg"
        assert info.width == 200
        assert info.height == 150

    def test_upload_image_creates_metadata(
        self, service: AnnotationService, sample_image_bytes: bytes
    ) -> None:
        """Test that uploading creates metadata file."""
        service.upload_image("test.png", sample_image_bytes)
        metadata_path = service.annotations_dir / "test.json"
        assert metadata_path.exists()

    def test_upload_image_metadata_content(
        self, service: AnnotationService, sample_image_bytes: bytes
    ) -> None:
        """Test that metadata file has correct content."""
        service.upload_image("test.png", sample_image_bytes)
        metadata_path = service.annotations_dir / "test.json"
        with metadata_path.open() as f:
            data = json.load(f)
        assert data["image"]["filename"] == "test.png"
        assert data["image"]["width"] == 100
        assert data["annotations"] == []

    def test_upload_duplicate_filename(
        self, service: AnnotationService, sample_image_bytes: bytes
    ) -> None:
        """Test uploading image with duplicate filename."""
        service.upload_image("test.png", sample_image_bytes)
        info = service.upload_image("test.png", sample_image_bytes)
        # Should get a different filename
        assert info.filename != "test.png"
        assert info.filename.startswith("test_")
        assert info.filename.endswith(".png")

    def test_upload_invalid_image_fails(self, service: AnnotationService) -> None:
        """Test that uploading invalid image data fails."""
        with pytest.raises(ValueError) as exc_info:
            service.upload_image("test.png", b"not an image")
        assert "Invalid image" in str(exc_info.value)

    def test_upload_prevents_path_traversal(
        self, service: AnnotationService, sample_image_bytes: bytes
    ) -> None:
        """Test that path traversal is prevented."""
        info = service.upload_image("../../../etc/passwd.png", sample_image_bytes)
        # Should only use the filename, not the path
        assert "/" not in info.filename
        assert ".." not in info.filename

    def test_list_images_returns_sorted(
        self, service: AnnotationService, sample_image_bytes: bytes
    ) -> None:
        """Test that images are returned in sorted order."""
        service.upload_image("c.png", sample_image_bytes)
        service.upload_image("a.png", sample_image_bytes)
        service.upload_image("b.png", sample_image_bytes)
        images = service.list_images()
        assert images == ["a.png", "b.png", "c.png"]

    def test_list_images_filters_by_extension(
        self, service: AnnotationService, sample_image_bytes: bytes
    ) -> None:
        """Test that only image files are listed."""
        service.upload_image("test.png", sample_image_bytes)
        # Create a non-image file
        (service.images_dir / "notes.txt").write_text("hello")
        images = service.list_images()
        assert "test.png" in images
        assert "notes.txt" not in images

    def test_get_image_path(
        self, service: AnnotationService, sample_image_bytes: bytes
    ) -> None:
        """Test getting image path."""
        service.upload_image("test.png", sample_image_bytes)
        path = service.get_image_path("test.png")
        assert path is not None
        assert path.exists()
        assert path.name == "test.png"

    def test_get_image_path_nonexistent(self, service: AnnotationService) -> None:
        """Test getting path for nonexistent image."""
        path = service.get_image_path("nonexistent.png")
        assert path is None

    def test_delete_image(
        self, service: AnnotationService, sample_image_bytes: bytes
    ) -> None:
        """Test deleting an image."""
        service.upload_image("test.png", sample_image_bytes)
        result = service.delete_image("test.png")
        assert result is True
        assert service.get_image_path("test.png") is None

    def test_delete_image_removes_metadata(
        self, service: AnnotationService, sample_image_bytes: bytes
    ) -> None:
        """Test that deleting image also removes metadata."""
        service.upload_image("test.png", sample_image_bytes)
        metadata_path = service.annotations_dir / "test.json"
        assert metadata_path.exists()
        service.delete_image("test.png")
        assert not metadata_path.exists()

    def test_delete_nonexistent_image(self, service: AnnotationService) -> None:
        """Test deleting nonexistent image."""
        result = service.delete_image("nonexistent.png")
        assert result is False


class TestAnnotationOperations:
    """Tests for annotation CRUD operations."""

    def test_get_annotations_empty(
        self, service: AnnotationService, sample_image_bytes: bytes
    ) -> None:
        """Test getting annotations for image with none."""
        service.upload_image("test.png", sample_image_bytes)
        annotations = service.get_annotations("test.png")
        assert annotations == []

    def test_add_annotation(
        self, service: AnnotationService, sample_image_bytes: bytes
    ) -> None:
        """Test adding an annotation."""
        service.upload_image("test.png", sample_image_bytes)
        bbox = BoundingBox(x=0.5, y=0.5, width=0.2, height=0.2)
        create = AnnotationCreate(label="product", class_id=0, bbox=bbox)
        ann = service.add_annotation("test.png", create)
        assert ann.label == "product"
        assert ann.class_id == 0
        assert ann.id  # Should have an ID

    def test_add_annotation_persists(
        self, service: AnnotationService, sample_image_bytes: bytes
    ) -> None:
        """Test that added annotation is persisted."""
        service.upload_image("test.png", sample_image_bytes)
        bbox = BoundingBox(x=0.5, y=0.5, width=0.2, height=0.2)
        create = AnnotationCreate(label="product", class_id=0, bbox=bbox)
        service.add_annotation("test.png", create)

        # Reload and check
        annotations = service.get_annotations("test.png")
        assert len(annotations) == 1
        assert annotations[0].label == "product"

    def test_add_multiple_annotations(
        self, service: AnnotationService, sample_image_bytes: bytes
    ) -> None:
        """Test adding multiple annotations."""
        service.upload_image("test.png", sample_image_bytes)

        for i in range(5):
            bbox = BoundingBox(x=0.1 * i, y=0.1 * i, width=0.1, height=0.1)
            create = AnnotationCreate(label=f"label{i}", class_id=i, bbox=bbox)
            service.add_annotation("test.png", create)

        annotations = service.get_annotations("test.png")
        assert len(annotations) == 5

    def test_add_annotation_to_nonexistent_image(
        self, service: AnnotationService
    ) -> None:
        """Test adding annotation to nonexistent image."""
        bbox = BoundingBox(x=0.5, y=0.5, width=0.2, height=0.2)
        create = AnnotationCreate(label="product", class_id=0, bbox=bbox)
        with pytest.raises(FileNotFoundError):
            service.add_annotation("nonexistent.png", create)

    def test_update_annotation(
        self, service: AnnotationService, sample_image_bytes: bytes
    ) -> None:
        """Test updating an annotation."""
        service.upload_image("test.png", sample_image_bytes)
        bbox = BoundingBox(x=0.5, y=0.5, width=0.2, height=0.2)
        create = AnnotationCreate(label="product", class_id=0, bbox=bbox)
        ann = service.add_annotation("test.png", create)

        update = AnnotationUpdate(label="price", class_id=1)
        updated = service.update_annotation("test.png", ann.id, update)

        assert updated is not None
        assert updated.label == "price"
        assert updated.class_id == 1
        # bbox should remain unchanged
        assert updated.bbox.x == 0.5

    def test_update_annotation_bbox(
        self, service: AnnotationService, sample_image_bytes: bytes
    ) -> None:
        """Test updating annotation bbox."""
        service.upload_image("test.png", sample_image_bytes)
        bbox = BoundingBox(x=0.5, y=0.5, width=0.2, height=0.2)
        create = AnnotationCreate(label="product", class_id=0, bbox=bbox)
        ann = service.add_annotation("test.png", create)

        new_bbox = BoundingBox(x=0.7, y=0.7, width=0.3, height=0.3)
        update = AnnotationUpdate(bbox=new_bbox)
        updated = service.update_annotation("test.png", ann.id, update)

        assert updated is not None
        assert updated.bbox.x == 0.7
        assert updated.bbox.width == 0.3

    def test_update_nonexistent_annotation(
        self, service: AnnotationService, sample_image_bytes: bytes
    ) -> None:
        """Test updating nonexistent annotation."""
        service.upload_image("test.png", sample_image_bytes)
        update = AnnotationUpdate(label="price")
        result = service.update_annotation("test.png", "nonexistent-id", update)
        assert result is None

    def test_delete_annotation(
        self, service: AnnotationService, sample_image_bytes: bytes
    ) -> None:
        """Test deleting an annotation."""
        service.upload_image("test.png", sample_image_bytes)
        bbox = BoundingBox(x=0.5, y=0.5, width=0.2, height=0.2)
        create = AnnotationCreate(label="product", class_id=0, bbox=bbox)
        ann = service.add_annotation("test.png", create)

        result = service.delete_annotation("test.png", ann.id)
        assert result is True

        annotations = service.get_annotations("test.png")
        assert len(annotations) == 0

    def test_delete_nonexistent_annotation(
        self, service: AnnotationService, sample_image_bytes: bytes
    ) -> None:
        """Test deleting nonexistent annotation."""
        service.upload_image("test.png", sample_image_bytes)
        result = service.delete_annotation("test.png", "nonexistent-id")
        assert result is False

    def test_clear_annotations(
        self, service: AnnotationService, sample_image_bytes: bytes
    ) -> None:
        """Test clearing all annotations."""
        service.upload_image("test.png", sample_image_bytes)

        for i in range(3):
            bbox = BoundingBox(x=0.1 * i, y=0.1 * i, width=0.1, height=0.1)
            create = AnnotationCreate(label=f"label{i}", class_id=i, bbox=bbox)
            service.add_annotation("test.png", create)

        count = service.clear_annotations("test.png")
        assert count == 3

        annotations = service.get_annotations("test.png")
        assert len(annotations) == 0

    def test_clear_annotations_empty(
        self, service: AnnotationService, sample_image_bytes: bytes
    ) -> None:
        """Test clearing when no annotations exist."""
        service.upload_image("test.png", sample_image_bytes)
        count = service.clear_annotations("test.png")
        assert count == 0


class TestCopyAnnotations:
    """Tests for annotation copying functionality."""

    def test_copy_annotations(
        self, service: AnnotationService, sample_image_bytes: bytes
    ) -> None:
        """Test copying annotations from one image to another."""
        service.upload_image("source.png", sample_image_bytes)
        service.upload_image("target.png", sample_image_bytes)

        # Add annotations to source
        for i in range(3):
            bbox = BoundingBox(x=0.1 * i, y=0.1 * i, width=0.1, height=0.1)
            create = AnnotationCreate(label=f"label{i}", class_id=i, bbox=bbox)
            service.add_annotation("source.png", create)

        count = service.copy_annotations("source.png", "target.png")
        assert count == 3

        target_annotations = service.get_annotations("target.png")
        assert len(target_annotations) == 3

    def test_copy_annotations_generates_new_ids(
        self, service: AnnotationService, sample_image_bytes: bytes
    ) -> None:
        """Test that copied annotations have new IDs."""
        service.upload_image("source.png", sample_image_bytes)
        service.upload_image("target.png", sample_image_bytes)

        bbox = BoundingBox(x=0.5, y=0.5, width=0.2, height=0.2)
        create = AnnotationCreate(label="product", class_id=0, bbox=bbox)
        original = service.add_annotation("source.png", create)

        service.copy_annotations("source.png", "target.png")

        target_annotations = service.get_annotations("target.png")
        assert target_annotations[0].id != original.id

    def test_copy_from_nonexistent_source(
        self, service: AnnotationService, sample_image_bytes: bytes
    ) -> None:
        """Test copying from nonexistent source."""
        service.upload_image("target.png", sample_image_bytes)
        count = service.copy_annotations("nonexistent.png", "target.png")
        assert count == 0

    def test_copy_to_nonexistent_target(
        self, service: AnnotationService, sample_image_bytes: bytes
    ) -> None:
        """Test copying to nonexistent target."""
        service.upload_image("source.png", sample_image_bytes)
        bbox = BoundingBox(x=0.5, y=0.5, width=0.2, height=0.2)
        create = AnnotationCreate(label="product", class_id=0, bbox=bbox)
        service.add_annotation("source.png", create)

        count = service.copy_annotations("source.png", "nonexistent.png")
        assert count == 0


class TestProjectInfo:
    """Tests for project info retrieval."""

    def test_project_info_empty(self, service: AnnotationService) -> None:
        """Test project info when empty."""
        info = service.get_project_info()
        assert info.image_count == 0
        assert info.annotation_count == 0
        assert info.labels == []

    def test_project_info_with_images(
        self, service: AnnotationService, sample_image_bytes: bytes
    ) -> None:
        """Test project info with images."""
        service.upload_image("test1.png", sample_image_bytes)
        service.upload_image("test2.png", sample_image_bytes)
        info = service.get_project_info()
        assert info.image_count == 2

    def test_project_info_with_annotations(
        self, service: AnnotationService, sample_image_bytes: bytes
    ) -> None:
        """Test project info with annotations."""
        service.upload_image("test.png", sample_image_bytes)

        bbox = BoundingBox(x=0.5, y=0.5, width=0.2, height=0.2)
        service.add_annotation(
            "test.png", AnnotationCreate(label="product", class_id=0, bbox=bbox)
        )
        service.add_annotation(
            "test.png", AnnotationCreate(label="price", class_id=1, bbox=bbox)
        )

        info = service.get_project_info()
        assert info.annotation_count == 2
        assert set(info.labels) == {"product", "price"}

    def test_project_info_labels_sorted(
        self, service: AnnotationService, sample_image_bytes: bytes
    ) -> None:
        """Test that project info labels are sorted."""
        service.upload_image("test.png", sample_image_bytes)
        bbox = BoundingBox(x=0.5, y=0.5, width=0.2, height=0.2)

        # Add in non-sorted order
        service.add_annotation(
            "test.png", AnnotationCreate(label="zebra", class_id=0, bbox=bbox)
        )
        service.add_annotation(
            "test.png", AnnotationCreate(label="apple", class_id=1, bbox=bbox)
        )
        service.add_annotation(
            "test.png", AnnotationCreate(label="mango", class_id=2, bbox=bbox)
        )

        info = service.get_project_info()
        assert info.labels == ["apple", "mango", "zebra"]


class TestBackup:
    """Tests for backup functionality."""

    def test_backup_project(
        self,
        service: AnnotationService,
        sample_image_bytes: bytes,
        temp_data_dir: Path,
    ) -> None:
        """Test backing up the project."""
        service.upload_image("test.png", sample_image_bytes)
        bbox = BoundingBox(x=0.5, y=0.5, width=0.2, height=0.2)
        service.add_annotation(
            "test.png", AnnotationCreate(label="product", class_id=0, bbox=bbox)
        )

        backup_dir = temp_data_dir / "backups"
        backup_path = service.backup_project(backup_dir)

        assert backup_path.exists()
        assert (backup_path / "images" / "test.png").exists()
        assert (backup_path / "annotations" / "test.json").exists()


class TestDoneStatus:
    """Tests for image done status tracking."""

    def test_mark_image_done(
        self, service: AnnotationService, sample_image_bytes: bytes
    ) -> None:
        """Test marking an image as done."""
        service.upload_image("test.png", sample_image_bytes)
        result = service.mark_image_done("test.png", done=True)
        assert result is True
        assert service.get_image_done_status("test.png") is True

    def test_mark_image_not_done(
        self, service: AnnotationService, sample_image_bytes: bytes
    ) -> None:
        """Test marking an image as not done."""
        service.upload_image("test.png", sample_image_bytes)
        service.mark_image_done("test.png", done=True)
        service.mark_image_done("test.png", done=False)
        assert service.get_image_done_status("test.png") is False

    def test_mark_nonexistent_image_done(self, service: AnnotationService) -> None:
        """Test marking nonexistent image as done returns False."""
        result = service.mark_image_done("nonexistent.png", done=True)
        assert result is False

    def test_get_done_status_nonexistent(self, service: AnnotationService) -> None:
        """Test get_image_done_status for nonexistent image."""
        status = service.get_image_done_status("nonexistent.png")
        assert status is None

    def test_get_all_done_status_empty(self, service: AnnotationService) -> None:
        """Test get_all_done_status with no images."""
        status = service.get_all_done_status()
        assert status == {}

    def test_get_all_done_status_includes_all_images(
        self, service: AnnotationService, sample_image_bytes: bytes
    ) -> None:
        """Test that get_all_done_status includes ALL images, not just annotated."""
        # Create 3 images - only annotate 1, mark 2 as done
        for i in range(3):
            filename = f"image_{i}.png"
            service.upload_image(filename, sample_image_bytes)

        # Add annotation to first image only
        bbox = BoundingBox(x=0.5, y=0.5, width=0.2, height=0.2)
        service.add_annotation(
            "image_0.png", AnnotationCreate(label="product", class_id=0, bbox=bbox)
        )

        # Mark first two as done
        service.mark_image_done("image_0.png", done=True)
        service.mark_image_done("image_1.png", done=True)

        status = service.get_all_done_status()

        # All 3 images should be in the result
        assert len(status) == 3
        assert status["image_0.png"] is True
        assert status["image_1.png"] is True
        assert status["image_2.png"] is False  # Not marked as done

    def test_get_all_done_status_new_images_default_false(
        self, service: AnnotationService, sample_image_bytes: bytes
    ) -> None:
        """Test that newly uploaded images without annotations default to done=False."""
        # Upload image without adding annotations or marking done
        service.upload_image("test.png", sample_image_bytes)

        status = service.get_all_done_status()

        # Image should be in result with done=False
        assert "test.png" in status
        assert status["test.png"] is False

    def test_done_status_persists_across_reload(
        self, temp_data_dir: Path, sample_image_bytes: bytes
    ) -> None:
        """Test that done status persists when service is reloaded."""
        # Create service, add data, mark as done
        service1 = AnnotationService(temp_data_dir)
        service1.upload_image("test.png", sample_image_bytes)
        bbox = BoundingBox(x=0.5, y=0.5, width=0.2, height=0.2)
        service1.add_annotation(
            "test.png", AnnotationCreate(label="product", class_id=0, bbox=bbox)
        )
        service1.mark_image_done("test.png", done=True)

        # Create new service instance pointing to same directory
        service2 = AnnotationService(temp_data_dir)

        # Done status should persist
        status = service2.get_all_done_status()
        assert status["test.png"] is True
        assert service2.get_image_done_status("test.png") is True
