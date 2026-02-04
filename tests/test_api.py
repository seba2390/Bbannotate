"""Tests for the annotation API."""

import io
import tempfile
import zipfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from src.main import app


@pytest.fixture
def client() -> TestClient:
    """Create test client."""
    return TestClient(app)


@pytest.fixture
def temp_data_dir(monkeypatch: pytest.MonkeyPatch) -> Path:
    """Create temporary data directory for testing."""
    with tempfile.TemporaryDirectory() as tmpdir:
        data_dir = Path(tmpdir)
        # Monkeypatch the DATA_DIR in routes
        from src.api import routes

        monkeypatch.setattr(routes, "DATA_DIR", data_dir)
        yield data_dir


@pytest.fixture
def sample_image() -> bytes:
    """Create a sample test image."""
    img = Image.new("RGB", (100, 100), color="red")
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return buffer.getvalue()


@pytest.fixture
def large_image() -> bytes:
    """Create a larger test image."""
    img = Image.new("RGB", (1920, 1080), color="blue")
    buffer = io.BytesIO()
    img.save(buffer, format="JPEG")
    return buffer.getvalue()


class TestProjectEndpoints:
    """Tests for project-level endpoints."""

    def test_get_project_info(
        self, client: TestClient, temp_data_dir: Path
    ) -> None:
        """Test getting project info."""
        response = client.get("/api/project")
        assert response.status_code == 200
        data = response.json()
        assert "labels" in data
        assert "image_count" in data
        assert "annotation_count" in data

    def test_get_project_info_with_data(
        self, client: TestClient, temp_data_dir: Path, sample_image: bytes
    ) -> None:
        """Test project info with images and annotations."""
        # Upload image
        client.post(
            "/api/images",
            files={"file": ("test.png", sample_image, "image/png")},
        )
        # Add annotation
        annotation = {
            "label": "product",
            "class_id": 0,
            "bbox": {"x": 0.5, "y": 0.5, "width": 0.2, "height": 0.2},
        }
        client.post("/api/images/test.png/annotations", json=annotation)

        response = client.get("/api/project")
        data = response.json()
        assert data["image_count"] == 1
        assert data["annotation_count"] == 1
        assert "product" in data["labels"]


class TestImageEndpoints:
    """Tests for image-related endpoints."""

    def test_list_images_empty(
        self, client: TestClient, temp_data_dir: Path
    ) -> None:
        """Test listing images when none exist."""
        response = client.get("/api/images")
        assert response.status_code == 200
        assert response.json() == []

    def test_upload_image(
        self, client: TestClient, temp_data_dir: Path, sample_image: bytes
    ) -> None:
        """Test uploading an image."""
        response = client.post(
            "/api/images",
            files={"file": ("test.png", sample_image, "image/png")},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["filename"] == "test.png"
        assert data["width"] == 100
        assert data["height"] == 100

    def test_upload_and_list(
        self, client: TestClient, temp_data_dir: Path, sample_image: bytes
    ) -> None:
        """Test uploading and listing images."""
        # Upload
        client.post(
            "/api/images",
            files={"file": ("test.png", sample_image, "image/png")},
        )

        # List
        response = client.get("/api/images")
        assert response.status_code == 200
        images = response.json()
        assert "test.png" in images

    def test_get_image(
        self, client: TestClient, temp_data_dir: Path, sample_image: bytes
    ) -> None:
        """Test getting an image file."""
        # Upload
        client.post(
            "/api/images",
            files={"file": ("test.png", sample_image, "image/png")},
        )

        # Get
        response = client.get("/api/images/test.png")
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("image/")

    def test_delete_image(
        self, client: TestClient, temp_data_dir: Path, sample_image: bytes
    ) -> None:
        """Test deleting an image."""
        # Upload
        client.post(
            "/api/images",
            files={"file": ("test.png", sample_image, "image/png")},
        )

        # Delete
        response = client.delete("/api/images/test.png")
        assert response.status_code == 200
        assert response.json()["success"] is True

        # Verify deleted
        response = client.get("/api/images")
        assert "test.png" not in response.json()


class TestAnnotationEndpoints:
    """Tests for annotation-related endpoints."""

    def test_get_annotations_empty(
        self, client: TestClient, temp_data_dir: Path, sample_image: bytes
    ) -> None:
        """Test getting annotations for image with none."""
        # Upload image first
        client.post(
            "/api/images",
            files={"file": ("test.png", sample_image, "image/png")},
        )

        response = client.get("/api/images/test.png/annotations")
        assert response.status_code == 200
        assert response.json() == []

    def test_add_annotation(
        self, client: TestClient, temp_data_dir: Path, sample_image: bytes
    ) -> None:
        """Test adding an annotation."""
        # Upload image
        client.post(
            "/api/images",
            files={"file": ("test.png", sample_image, "image/png")},
        )

        # Add annotation
        annotation = {
            "label": "product",
            "class_id": 0,
            "bbox": {"x": 0.5, "y": 0.5, "width": 0.2, "height": 0.2},
        }
        response = client.post("/api/images/test.png/annotations", json=annotation)
        assert response.status_code == 200
        data = response.json()
        assert data["label"] == "product"
        assert data["class_id"] == 0
        assert "id" in data

    def test_update_annotation(
        self, client: TestClient, temp_data_dir: Path, sample_image: bytes
    ) -> None:
        """Test updating an annotation."""
        # Upload and add annotation
        client.post(
            "/api/images",
            files={"file": ("test.png", sample_image, "image/png")},
        )
        annotation = {
            "label": "product",
            "class_id": 0,
            "bbox": {"x": 0.5, "y": 0.5, "width": 0.2, "height": 0.2},
        }
        create_response = client.post(
            "/api/images/test.png/annotations", json=annotation
        )
        ann_id = create_response.json()["id"]

        # Update
        update = {"label": "price", "class_id": 1}
        response = client.put(
            f"/api/images/test.png/annotations/{ann_id}", json=update
        )
        assert response.status_code == 200
        assert response.json()["label"] == "price"
        assert response.json()["class_id"] == 1

    def test_delete_annotation(
        self, client: TestClient, temp_data_dir: Path, sample_image: bytes
    ) -> None:
        """Test deleting an annotation."""
        # Upload and add annotation
        client.post(
            "/api/images",
            files={"file": ("test.png", sample_image, "image/png")},
        )
        annotation = {
            "label": "product",
            "class_id": 0,
            "bbox": {"x": 0.5, "y": 0.5, "width": 0.2, "height": 0.2},
        }
        create_response = client.post(
            "/api/images/test.png/annotations", json=annotation
        )
        ann_id = create_response.json()["id"]

        # Delete
        response = client.delete(f"/api/images/test.png/annotations/{ann_id}")
        assert response.status_code == 200
        assert response.json()["success"] is True

        # Verify deleted
        response = client.get("/api/images/test.png/annotations")
        assert len(response.json()) == 0


class TestHealthEndpoint:
    """Tests for health check endpoint."""

    def test_health_check(self, client: TestClient) -> None:
        """Test health check endpoint."""
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "healthy"}


class TestImageEndpointsErrorCases:
    """Tests for image endpoint error handling."""

    def test_get_nonexistent_image(
        self, client: TestClient, temp_data_dir: Path
    ) -> None:
        """Test getting a nonexistent image returns 404."""
        response = client.get("/api/images/nonexistent.png")
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_delete_nonexistent_image(
        self, client: TestClient, temp_data_dir: Path
    ) -> None:
        """Test deleting a nonexistent image returns 404."""
        response = client.delete("/api/images/nonexistent.png")
        assert response.status_code == 404

    def test_upload_invalid_image(
        self, client: TestClient, temp_data_dir: Path
    ) -> None:
        """Test uploading invalid image data returns 400."""
        response = client.post(
            "/api/images",
            files={"file": ("test.png", b"not an image", "image/png")},
        )
        assert response.status_code == 400
        assert "invalid" in response.json()["detail"].lower()

    def test_upload_multiple_images(
        self, client: TestClient, temp_data_dir: Path, sample_image: bytes
    ) -> None:
        """Test uploading multiple different images."""
        for i in range(5):
            response = client.post(
                "/api/images",
                files={"file": (f"test_{i}.png", sample_image, "image/png")},
            )
            assert response.status_code == 200

        response = client.get("/api/images")
        assert len(response.json()) == 5


class TestAnnotationEndpointsErrorCases:
    """Tests for annotation endpoint error handling."""

    def test_add_annotation_to_nonexistent_image(
        self, client: TestClient, temp_data_dir: Path
    ) -> None:
        """Test adding annotation to nonexistent image returns 404."""
        annotation = {
            "label": "product",
            "class_id": 0,
            "bbox": {"x": 0.5, "y": 0.5, "width": 0.2, "height": 0.2},
        }
        response = client.post(
            "/api/images/nonexistent.png/annotations", json=annotation
        )
        assert response.status_code == 404

    def test_update_nonexistent_annotation(
        self, client: TestClient, temp_data_dir: Path, sample_image: bytes
    ) -> None:
        """Test updating nonexistent annotation returns 404."""
        client.post(
            "/api/images",
            files={"file": ("test.png", sample_image, "image/png")},
        )
        update = {"label": "price"}
        response = client.put(
            "/api/images/test.png/annotations/nonexistent-id", json=update
        )
        assert response.status_code == 404

    def test_delete_nonexistent_annotation(
        self, client: TestClient, temp_data_dir: Path, sample_image: bytes
    ) -> None:
        """Test deleting nonexistent annotation returns 404."""
        client.post(
            "/api/images",
            files={"file": ("test.png", sample_image, "image/png")},
        )
        response = client.delete("/api/images/test.png/annotations/nonexistent-id")
        assert response.status_code == 404

    def test_add_annotation_invalid_bbox(
        self, client: TestClient, temp_data_dir: Path, sample_image: bytes
    ) -> None:
        """Test adding annotation with invalid bbox returns 422."""
        client.post(
            "/api/images",
            files={"file": ("test.png", sample_image, "image/png")},
        )
        annotation = {
            "label": "product",
            "class_id": 0,
            "bbox": {"x": 1.5, "y": 0.5, "width": 0.2, "height": 0.2},  # x > 1
        }
        response = client.post("/api/images/test.png/annotations", json=annotation)
        assert response.status_code == 422

    def test_add_annotation_negative_class_id(
        self, client: TestClient, temp_data_dir: Path, sample_image: bytes
    ) -> None:
        """Test adding annotation with negative class_id returns 422."""
        client.post(
            "/api/images",
            files={"file": ("test.png", sample_image, "image/png")},
        )
        annotation = {
            "label": "product",
            "class_id": -1,
            "bbox": {"x": 0.5, "y": 0.5, "width": 0.2, "height": 0.2},
        }
        response = client.post("/api/images/test.png/annotations", json=annotation)
        assert response.status_code == 422

    def test_add_annotation_empty_label(
        self, client: TestClient, temp_data_dir: Path, sample_image: bytes
    ) -> None:
        """Test adding annotation with empty label returns 422."""
        client.post(
            "/api/images",
            files={"file": ("test.png", sample_image, "image/png")},
        )
        annotation = {
            "label": "",
            "class_id": 0,
            "bbox": {"x": 0.5, "y": 0.5, "width": 0.2, "height": 0.2},
        }
        response = client.post("/api/images/test.png/annotations", json=annotation)
        assert response.status_code == 422


class TestClearAndCopyAnnotations:
    """Tests for clear and copy annotation operations."""

    def test_clear_annotations(
        self, client: TestClient, temp_data_dir: Path, sample_image: bytes
    ) -> None:
        """Test clearing all annotations for an image."""
        client.post(
            "/api/images",
            files={"file": ("test.png", sample_image, "image/png")},
        )

        # Add multiple annotations
        for i in range(3):
            annotation = {
                "label": f"label{i}",
                "class_id": i,
                "bbox": {"x": 0.5, "y": 0.5, "width": 0.2, "height": 0.2},
            }
            client.post("/api/images/test.png/annotations", json=annotation)

        # Clear all
        response = client.delete("/api/images/test.png/annotations")
        assert response.status_code == 200
        assert response.json()["deleted"] == 3

        # Verify empty
        response = client.get("/api/images/test.png/annotations")
        assert response.json() == []

    def test_copy_annotations(
        self, client: TestClient, temp_data_dir: Path, sample_image: bytes
    ) -> None:
        """Test copying annotations from one image to another."""
        # Upload two images
        client.post(
            "/api/images",
            files={"file": ("source.png", sample_image, "image/png")},
        )
        client.post(
            "/api/images",
            files={"file": ("target.png", sample_image, "image/png")},
        )

        # Add annotations to source
        for i in range(2):
            annotation = {
                "label": f"label{i}",
                "class_id": i,
                "bbox": {"x": 0.3 + 0.1 * i, "y": 0.5, "width": 0.2, "height": 0.2},
            }
            client.post("/api/images/source.png/annotations", json=annotation)

        # Copy to target
        response = client.post(
            "/api/images/target.png/annotations/copy-from/source.png"
        )
        assert response.status_code == 200
        assert response.json()["copied"] == 2

        # Verify target has annotations
        response = client.get("/api/images/target.png/annotations")
        assert len(response.json()) == 2


class TestExportEndpoints:
    """Tests for export functionality."""

    def test_export_yolo_empty(
        self, client: TestClient, temp_data_dir: Path
    ) -> None:
        """Test YOLO export with no data."""
        response = client.post("/api/export/yolo")
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/zip"

    def test_export_yolo_with_data(
        self, client: TestClient, temp_data_dir: Path, sample_image: bytes
    ) -> None:
        """Test YOLO export with images and annotations."""
        # Create some data
        for i in range(3):
            client.post(
                "/api/images",
                files={"file": (f"image_{i}.png", sample_image, "image/png")},
            )
            annotation = {
                "label": "product",
                "class_id": 0,
                "bbox": {"x": 0.5, "y": 0.5, "width": 0.2, "height": 0.2},
            }
            client.post(f"/api/images/image_{i}.png/annotations", json=annotation)

        response = client.post("/api/export/yolo?train_split=0.7")
        assert response.status_code == 200

        # Verify it's a valid ZIP
        zip_content = io.BytesIO(response.content)
        with zipfile.ZipFile(zip_content, "r") as zf:
            names = zf.namelist()
            assert "data.yaml" in names
            assert any("train/" in n for n in names)
            assert any("val/" in n for n in names)

    def test_export_yolo_train_split_validation(
        self, client: TestClient, temp_data_dir: Path
    ) -> None:
        """Test YOLO export train_split parameter validation."""
        # Too low
        response = client.post("/api/export/yolo?train_split=0.05")
        assert response.status_code == 422

        # Too high
        response = client.post("/api/export/yolo?train_split=1.0")
        assert response.status_code == 422

    def test_export_coco_empty(
        self, client: TestClient, temp_data_dir: Path
    ) -> None:
        """Test COCO export with no data."""
        response = client.post("/api/export/coco")
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/json"

    def test_export_coco_with_data(
        self, client: TestClient, temp_data_dir: Path, sample_image: bytes
    ) -> None:
        """Test COCO export with images and annotations."""
        client.post(
            "/api/images",
            files={"file": ("test.png", sample_image, "image/png")},
        )
        annotation = {
            "label": "product",
            "class_id": 0,
            "bbox": {"x": 0.5, "y": 0.5, "width": 0.2, "height": 0.2},
        }
        client.post("/api/images/test.png/annotations", json=annotation)

        response = client.post("/api/export/coco")
        assert response.status_code == 200

        data = response.json()
        assert len(data["images"]) == 1
        assert len(data["annotations"]) == 1
        assert len(data["categories"]) == 1


class TestSpecialCharactersInFilenames:
    """Tests for handling special characters in filenames."""

    def test_upload_image_with_spaces(
        self, client: TestClient, temp_data_dir: Path, sample_image: bytes
    ) -> None:
        """Test uploading image with spaces in filename."""
        response = client.post(
            "/api/images",
            files={"file": ("my image.png", sample_image, "image/png")},
        )
        assert response.status_code == 200
        # The filename should be preserved or sanitized
        assert response.json()["filename"]

    def test_url_encoded_filename(
        self, client: TestClient, temp_data_dir: Path, sample_image: bytes
    ) -> None:
        """Test accessing image with URL-encoded filename."""
        client.post(
            "/api/images",
            files={"file": ("test image.png", sample_image, "image/png")},
        )

        # Access with URL encoding
        response = client.get("/api/images/test%20image.png")
        # Should work or return 404 if filename was sanitized
        assert response.status_code in [200, 404]
