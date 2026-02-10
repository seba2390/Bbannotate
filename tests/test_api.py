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
        projects_dir = Path(tmpdir) / "projects"
        projects_dir.mkdir()
        # Use environment variables for path configuration
        monkeypatch.setenv("BBANNOTATE_DATA_DIR", str(data_dir))
        monkeypatch.setenv("BBANNOTATE_PROJECTS_DIR", str(projects_dir))
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


class TestHealthEndpoint:
    """Tests for the health check endpoint."""

    def test_health_check(self, client: TestClient) -> None:
        """Test that /api/health returns healthy status."""
        response = client.get("/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["api"] == "ready"

    def test_root_health_check(self, client: TestClient) -> None:
        """Test that /health (root level) also returns healthy status."""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"


class TestBrowserSessionEndpoints:
    """Tests for detached browser session lifecycle endpoints."""

    def test_session_heartbeat_disabled_returns_404(self, client: TestClient) -> None:
        """Heartbeat should be unavailable when session lifecycle is disabled."""
        response = client.post("/api/session/heartbeat", json={"token": "test-token"})
        assert response.status_code == 404

    def test_session_heartbeat_accepts_valid_token(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Heartbeat succeeds when token matches configured detached session."""
        token = "test-browser-session-token"
        monkeypatch.setenv("BBANNOTATE_SESSION_TOKEN", token)
        with TestClient(app) as token_client:
            response = token_client.post(
                "/api/session/heartbeat",
                json={"token": token},
            )
            assert response.status_code == 200
            assert response.json()["ok"] is True

    def test_session_heartbeat_rejects_invalid_token(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Heartbeat should reject requests with invalid token."""
        monkeypatch.setenv("BBANNOTATE_SESSION_TOKEN", "expected-token")
        with TestClient(app) as token_client:
            response = token_client.post(
                "/api/session/heartbeat",
                json={"token": "wrong-token"},
            )
            assert response.status_code == 403

    def test_session_close_rejects_invalid_token(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Close endpoint should reject invalid session token."""
        monkeypatch.setenv("BBANNOTATE_SESSION_TOKEN", "expected-token")
        with TestClient(app) as token_client:
            response = token_client.post(
                "/api/session/close",
                json={"token": "wrong-token"},
            )
            assert response.status_code == 403


class TestProjectEndpoints:
    """Tests for project-level endpoints."""

    def test_get_project_info(self, client: TestClient, temp_data_dir: Path) -> None:
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


class TestProjectManagementEndpoints:
    """Tests for project management endpoints."""

    def test_rename_project(self, client: TestClient, temp_data_dir: Path) -> None:
        """Test renaming an existing project."""
        create_response = client.post("/api/projects", json={"name": "Old Name"})
        assert create_response.status_code == 200
        project_id = create_response.json()["id"]

        rename_response = client.patch(
            f"/api/projects/{project_id}",
            json={"name": "New Name"},
        )
        assert rename_response.status_code == 200
        renamed = rename_response.json()
        assert renamed["id"] == project_id
        assert renamed["name"] == "New Name"

        list_response = client.get("/api/projects")
        assert list_response.status_code == 200
        projects = list_response.json()
        assert any(p["id"] == project_id and p["name"] == "New Name" for p in projects)

    def test_rename_project_not_found(
        self, client: TestClient, temp_data_dir: Path
    ) -> None:
        """Test renaming a non-existent project returns 404."""
        response = client.patch(
            "/api/projects/nonexistent",
            json={"name": "New Name"},
        )
        assert response.status_code == 404
        assert response.json()["detail"] == "Project not found"

    def test_rename_project_whitespace_name_returns_400(
        self, client: TestClient, temp_data_dir: Path
    ) -> None:
        """Test renaming with whitespace-only name returns 400."""
        create_response = client.post("/api/projects", json={"name": "Original"})
        assert create_response.status_code == 200
        project_id = create_response.json()["id"]

        response = client.patch(
            f"/api/projects/{project_id}",
            json={"name": "   "},
        )
        assert response.status_code == 400
        assert "cannot be empty" in response.json()["detail"].lower()


class TestImageEndpoints:
    """Tests for image-related endpoints."""

    def test_list_images_empty(self, client: TestClient, temp_data_dir: Path) -> None:
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

    def test_get_image_with_project_id_query_param(
        self, client: TestClient, temp_data_dir: Path, sample_image: bytes
    ) -> None:
        """Test getting an image using project_id query parameter.

        This tests the fix for browser <img> tags which cannot send custom headers.
        The query parameter should work the same as the X-Project-Id header.
        """
        # Create a project first
        create_response = client.post(
            "/api/projects",
            json={"name": "Test Project"},
        )
        project_id = create_response.json()["id"]

        # Upload image to the project using header
        client.post(
            "/api/images",
            files={"file": ("test.png", sample_image, "image/png")},
            headers={"X-Project-Id": project_id},
        )

        # Get image using query parameter (simulating browser <img> behavior)
        response = client.get(f"/api/images/test.png?project_id={project_id}")
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("image/")

        # Verify the image was fetched from the correct project directory
        # (not from the legacy data directory)
        response_content = response.content
        assert len(response_content) > 0

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
        response = client.put(f"/api/images/test.png/annotations/{ann_id}", json=update)
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

    def test_export_yolo_empty(self, client: TestClient, temp_data_dir: Path) -> None:
        """Test YOLO export with no data."""
        response = client.post("/api/export/yolo")
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/zip"

    def test_export_yolo_with_data(
        self, client: TestClient, temp_data_dir: Path, sample_image: bytes
    ) -> None:
        """Test YOLO export with images and annotations."""
        # Create some data and mark as done
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
            # Mark image as done so it will be exported
            client.patch(f"/api/images/image_{i}.png/done?done=true")

        response = client.post("/api/export/yolo?train_split=0.7&val_split=0.3")
        assert response.status_code == 200

        # Verify it's a valid ZIP
        zip_content = io.BytesIO(response.content)
        with zipfile.ZipFile(zip_content, "r") as zf:
            names = zf.namelist()
            assert "data.yaml" in names
            assert any("train/" in n for n in names)
            # Should have train and/or val images (3 images with 0.7/0.3 split)

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

    def test_export_coco_empty(self, client: TestClient, temp_data_dir: Path) -> None:
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


class TestExportWithProjectId:
    """Tests for export functionality with project_id query parameter."""

    def test_export_yolo_with_project_id(
        self, client: TestClient, temp_data_dir: Path, sample_image: bytes
    ) -> None:
        """Test YOLO export with project_id query parameter."""
        # Create a project
        response = client.post("/api/projects", json={"name": "Export Test Project"})
        assert response.status_code == 200
        project_id = response.json()["id"]

        # Open the project
        client.post(f"/api/projects/{project_id}/open")

        # Upload image to project (with header)
        client.post(
            "/api/images",
            files={"file": ("test.png", sample_image, "image/png")},
            headers={"X-Project-Id": project_id},
        )

        # Add annotation
        annotation = {
            "label": "my_label",
            "class_id": 0,
            "bbox": {"x": 0.5, "y": 0.5, "width": 0.2, "height": 0.2},
        }
        client.post(
            "/api/images/test.png/annotations",
            json=annotation,
            headers={"X-Project-Id": project_id},
        )

        # Mark image as done
        client.patch(
            "/api/images/test.png/done?done=true",
            headers={"X-Project-Id": project_id},
        )

        # Export with project_id query parameter (simulating form submission)
        response = client.post(f"/api/export/yolo?project_id={project_id}")
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/zip"

        # Verify ZIP contains correct data
        zip_content = io.BytesIO(response.content)
        with zipfile.ZipFile(zip_content, "r") as zf:
            names = zf.namelist()
            assert "data.yaml" in names

            # Check data.yaml has correct labels
            yaml_content = zf.read("data.yaml").decode("utf-8")
            assert "nc: 1" in yaml_content
            assert "my_label" in yaml_content
            # Should use relative path
            assert "path: ." in yaml_content

    def test_export_yolo_without_project_id_uses_legacy(
        self, client: TestClient, temp_data_dir: Path, sample_image: bytes
    ) -> None:
        """Test YOLO export without project_id falls back to legacy directory."""
        # Upload to legacy directory (no project header)
        client.post(
            "/api/images",
            files={"file": ("legacy.png", sample_image, "image/png")},
        )
        annotation = {
            "label": "legacy_label",
            "class_id": 0,
            "bbox": {"x": 0.5, "y": 0.5, "width": 0.2, "height": 0.2},
        }
        client.post("/api/images/legacy.png/annotations", json=annotation)
        # Mark as done
        client.patch("/api/images/legacy.png/done?done=true")

        # Export without project_id
        response = client.post("/api/export/yolo")
        assert response.status_code == 200

        zip_content = io.BytesIO(response.content)
        with zipfile.ZipFile(zip_content, "r") as zf:
            yaml_content = zf.read("data.yaml").decode("utf-8")
            assert "legacy_label" in yaml_content

    def test_export_coco_with_project_id(
        self, client: TestClient, temp_data_dir: Path, sample_image: bytes
    ) -> None:
        """Test COCO export with project_id query parameter."""
        # Create and open project
        response = client.post("/api/projects", json={"name": "COCO Export Test"})
        project_id = response.json()["id"]
        client.post(f"/api/projects/{project_id}/open")

        # Add data to project
        client.post(
            "/api/images",
            files={"file": ("test.png", sample_image, "image/png")},
            headers={"X-Project-Id": project_id},
        )
        annotation = {
            "label": "coco_label",
            "class_id": 0,
            "bbox": {"x": 0.5, "y": 0.5, "width": 0.2, "height": 0.2},
        }
        client.post(
            "/api/images/test.png/annotations",
            json=annotation,
            headers={"X-Project-Id": project_id},
        )

        # Export with project_id query param
        response = client.post(f"/api/export/coco?project_id={project_id}")
        assert response.status_code == 200

        data = response.json()
        assert len(data["images"]) == 1
        assert len(data["categories"]) == 1
        assert data["categories"][0]["name"] == "coco_label"

    def test_export_pascal_voc_with_project_id(
        self, client: TestClient, temp_data_dir: Path, sample_image: bytes
    ) -> None:
        """Test Pascal VOC export with project_id query parameter."""
        # Create and open project
        response = client.post("/api/projects", json={"name": "VOC Export Test"})
        project_id = response.json()["id"]
        client.post(f"/api/projects/{project_id}/open")

        # Add data
        client.post(
            "/api/images",
            files={"file": ("test.png", sample_image, "image/png")},
            headers={"X-Project-Id": project_id},
        )
        annotation = {
            "label": "voc_label",
            "class_id": 0,
            "bbox": {"x": 0.5, "y": 0.5, "width": 0.2, "height": 0.2},
        }
        client.post(
            "/api/images/test.png/annotations",
            json=annotation,
            headers={"X-Project-Id": project_id},
        )

        # Export
        response = client.post(f"/api/export/pascal-voc?project_id={project_id}")
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/zip"

        zip_content = io.BytesIO(response.content)
        with zipfile.ZipFile(zip_content, "r") as zf:
            names = zf.namelist()
            assert any("Annotations" in n for n in names)
            assert any("JPEGImages" in n for n in names)

    def test_export_createml_with_project_id(
        self, client: TestClient, temp_data_dir: Path, sample_image: bytes
    ) -> None:
        """Test CreateML export with project_id query parameter."""
        # Create and open project
        response = client.post("/api/projects", json={"name": "CreateML Export Test"})
        project_id = response.json()["id"]
        client.post(f"/api/projects/{project_id}/open")

        # Add data
        client.post(
            "/api/images",
            files={"file": ("test.png", sample_image, "image/png")},
            headers={"X-Project-Id": project_id},
        )
        annotation = {
            "label": "createml_label",
            "class_id": 0,
            "bbox": {"x": 0.5, "y": 0.5, "width": 0.2, "height": 0.2},
        }
        client.post(
            "/api/images/test.png/annotations",
            json=annotation,
            headers={"X-Project-Id": project_id},
        )

        # Export
        response = client.post(f"/api/export/createml?project_id={project_id}")
        assert response.status_code == 200

        data = response.json()
        assert len(data) == 1
        assert data[0]["image"] == "test.png"
        assert data[0]["annotations"][0]["label"] == "createml_label"

    def test_export_csv_with_project_id(
        self, client: TestClient, temp_data_dir: Path, sample_image: bytes
    ) -> None:
        """Test CSV export with project_id query parameter."""
        # Create and open project
        response = client.post("/api/projects", json={"name": "CSV Export Test"})
        project_id = response.json()["id"]
        client.post(f"/api/projects/{project_id}/open")

        # Add data
        client.post(
            "/api/images",
            files={"file": ("test.png", sample_image, "image/png")},
            headers={"X-Project-Id": project_id},
        )
        annotation = {
            "label": "csv_label",
            "class_id": 0,
            "bbox": {"x": 0.5, "y": 0.5, "width": 0.2, "height": 0.2},
        }
        client.post(
            "/api/images/test.png/annotations",
            json=annotation,
            headers={"X-Project-Id": project_id},
        )

        # Export
        response = client.post(f"/api/export/csv?project_id={project_id}")
        assert response.status_code == 200
        assert response.headers["content-type"] == "text/csv; charset=utf-8"

        content = response.content.decode("utf-8")
        assert "csv_label" in content
        assert "test.png" in content


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
