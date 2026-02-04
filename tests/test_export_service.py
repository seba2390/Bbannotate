"""Tests for the ExportService."""

import io
import json
import tempfile
import zipfile
from pathlib import Path

import pytest
from PIL import Image

from src.models.annotations import AnnotationCreate, BoundingBox
from src.services.annotation_service import AnnotationService
from src.services.export_service import ExportService


@pytest.fixture
def temp_data_dir() -> Path:
    """Create temporary data directory for testing."""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield Path(tmpdir)


@pytest.fixture
def annotation_service(temp_data_dir: Path) -> AnnotationService:
    """Create annotation service with temp directory."""
    return AnnotationService(temp_data_dir)


@pytest.fixture
def export_service(annotation_service: AnnotationService) -> ExportService:
    """Create export service."""
    return ExportService(annotation_service)


@pytest.fixture
def sample_image_bytes() -> bytes:
    """Create sample image bytes."""
    img = Image.new("RGB", (100, 100), color="red")
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return buffer.getvalue()


def create_test_dataset(
    service: AnnotationService, sample_image_bytes: bytes, num_images: int = 5
) -> None:
    """Create a test dataset with images and annotations."""
    labels = ["product", "price", "brand"]
    for i in range(num_images):
        filename = f"image_{i:03d}.png"
        service.upload_image(filename, sample_image_bytes)

        # Add 2-3 annotations per image
        for j in range(2 + (i % 2)):
            bbox = BoundingBox(
                x=0.2 + 0.1 * j,
                y=0.2 + 0.1 * j,
                width=0.15,
                height=0.15,
            )
            label = labels[j % len(labels)]
            create = AnnotationCreate(label=label, class_id=j % len(labels), bbox=bbox)
            service.add_annotation(filename, create)


class TestExportServiceInit:
    """Tests for ExportService initialization."""

    def test_init(
        self, annotation_service: AnnotationService, export_service: ExportService
    ) -> None:
        """Test export service initialization."""
        assert export_service.annotation_service is annotation_service


class TestGetAllLabels:
    """Tests for label extraction."""

    def test_get_all_labels_empty(self, export_service: ExportService) -> None:
        """Test getting labels when no annotations exist."""
        labels = export_service._get_all_labels()
        assert labels == []

    def test_get_all_labels(
        self,
        annotation_service: AnnotationService,
        export_service: ExportService,
        sample_image_bytes: bytes,
    ) -> None:
        """Test getting all unique labels."""
        create_test_dataset(annotation_service, sample_image_bytes)
        labels = export_service._get_all_labels()
        assert set(labels) == {"brand", "price", "product"}

    def test_get_all_labels_sorted(
        self,
        annotation_service: AnnotationService,
        export_service: ExportService,
        sample_image_bytes: bytes,
    ) -> None:
        """Test that labels are sorted alphabetically."""
        create_test_dataset(annotation_service, sample_image_bytes)
        labels = export_service._get_all_labels()
        assert labels == sorted(labels)


class TestYoloExport:
    """Tests for YOLO format export."""

    def test_export_yolo_creates_directory_structure(
        self,
        annotation_service: AnnotationService,
        export_service: ExportService,
        sample_image_bytes: bytes,
        temp_data_dir: Path,
    ) -> None:
        """Test that YOLO export creates correct directory structure."""
        create_test_dataset(annotation_service, sample_image_bytes)
        output_dir = temp_data_dir / "yolo_export"
        export_service.export_yolo(output_dir)

        assert (output_dir / "train" / "images").exists()
        assert (output_dir / "train" / "labels").exists()
        assert (output_dir / "val" / "images").exists()
        assert (output_dir / "val" / "labels").exists()
        assert (output_dir / "data.yaml").exists()

    def test_export_yolo_data_yaml_content(
        self,
        annotation_service: AnnotationService,
        export_service: ExportService,
        sample_image_bytes: bytes,
        temp_data_dir: Path,
    ) -> None:
        """Test data.yaml content."""
        create_test_dataset(annotation_service, sample_image_bytes)
        output_dir = temp_data_dir / "yolo_export"
        yaml_path = export_service.export_yolo(output_dir)

        content = yaml_path.read_text()
        assert "train: train/images" in content
        assert "val: val/images" in content
        assert "nc: 3" in content  # 3 unique labels
        assert "product" in content
        assert "price" in content
        assert "brand" in content

    def test_export_yolo_train_val_split(
        self,
        annotation_service: AnnotationService,
        export_service: ExportService,
        sample_image_bytes: bytes,
        temp_data_dir: Path,
    ) -> None:
        """Test train/validation split."""
        create_test_dataset(annotation_service, sample_image_bytes, num_images=10)
        output_dir = temp_data_dir / "yolo_export"
        export_service.export_yolo(output_dir, train_split=0.8)

        train_images = list((output_dir / "train" / "images").glob("*.png"))
        val_images = list((output_dir / "val" / "images").glob("*.png"))

        assert len(train_images) == 8
        assert len(val_images) == 2

    def test_export_yolo_label_files_created(
        self,
        annotation_service: AnnotationService,
        export_service: ExportService,
        sample_image_bytes: bytes,
        temp_data_dir: Path,
    ) -> None:
        """Test that label files are created for each image."""
        annotation_service.upload_image("test.png", sample_image_bytes)
        bbox = BoundingBox(x=0.5, y=0.5, width=0.2, height=0.2)
        annotation_service.add_annotation(
            "test.png", AnnotationCreate(label="product", class_id=0, bbox=bbox)
        )

        output_dir = temp_data_dir / "yolo_export"
        export_service.export_yolo(output_dir, train_split=1.0)  # All to train

        label_file = output_dir / "train" / "labels" / "test.txt"
        assert label_file.exists()

    def test_export_yolo_label_file_format(
        self,
        annotation_service: AnnotationService,
        export_service: ExportService,
        sample_image_bytes: bytes,
        temp_data_dir: Path,
    ) -> None:
        """Test YOLO label file format."""
        annotation_service.upload_image("test.png", sample_image_bytes)
        bbox = BoundingBox(x=0.5, y=0.6, width=0.2, height=0.3)
        annotation_service.add_annotation(
            "test.png", AnnotationCreate(label="product", class_id=0, bbox=bbox)
        )

        output_dir = temp_data_dir / "yolo_export"
        export_service.export_yolo(output_dir, train_split=1.0)

        label_file = output_dir / "train" / "labels" / "test.txt"
        content = label_file.read_text().strip()

        # YOLO format: class_id center_x center_y width height
        parts = content.split()
        assert len(parts) == 5
        assert parts[0] == "0"  # class_id
        assert float(parts[1]) == pytest.approx(0.5, abs=0.001)  # center_x
        assert float(parts[2]) == pytest.approx(0.6, abs=0.001)  # center_y
        assert float(parts[3]) == pytest.approx(0.2, abs=0.001)  # width
        assert float(parts[4]) == pytest.approx(0.3, abs=0.001)  # height

    def test_export_yolo_multiple_annotations(
        self,
        annotation_service: AnnotationService,
        export_service: ExportService,
        sample_image_bytes: bytes,
        temp_data_dir: Path,
    ) -> None:
        """Test export with multiple annotations per image."""
        annotation_service.upload_image("test.png", sample_image_bytes)

        for i in range(3):
            bbox = BoundingBox(x=0.2 + 0.2 * i, y=0.5, width=0.1, height=0.1)
            annotation_service.add_annotation(
                "test.png", AnnotationCreate(label=f"label{i}", class_id=i, bbox=bbox)
            )

        output_dir = temp_data_dir / "yolo_export"
        export_service.export_yolo(output_dir, train_split=1.0)

        label_file = output_dir / "train" / "labels" / "test.txt"
        lines = label_file.read_text().strip().split("\n")
        assert len(lines) == 3

    def test_export_yolo_empty_dataset(
        self,
        export_service: ExportService,
        temp_data_dir: Path,
    ) -> None:
        """Test export with empty dataset."""
        output_dir = temp_data_dir / "yolo_export"
        yaml_path = export_service.export_yolo(output_dir)

        assert yaml_path.exists()
        content = yaml_path.read_text()
        assert "nc: 0" in content


class TestYoloZipExport:
    """Tests for YOLO ZIP export."""

    def test_export_yolo_zip_creates_file(
        self,
        annotation_service: AnnotationService,
        export_service: ExportService,
        sample_image_bytes: bytes,
    ) -> None:
        """Test that YOLO ZIP export creates a zip file."""
        create_test_dataset(annotation_service, sample_image_bytes)
        zip_path = export_service.export_yolo_zip()

        assert zip_path.exists()
        assert zip_path.suffix == ".zip"

    def test_export_yolo_zip_contents(
        self,
        annotation_service: AnnotationService,
        export_service: ExportService,
        sample_image_bytes: bytes,
    ) -> None:
        """Test ZIP file contents."""
        create_test_dataset(annotation_service, sample_image_bytes, num_images=5)
        zip_path = export_service.export_yolo_zip()

        with zipfile.ZipFile(zip_path, "r") as zf:
            names = zf.namelist()
            assert "data.yaml" in names
            assert any("train/images/" in name for name in names)
            assert any("train/labels/" in name for name in names)

    def test_export_yolo_zip_train_split(
        self,
        annotation_service: AnnotationService,
        export_service: ExportService,
        sample_image_bytes: bytes,
    ) -> None:
        """Test that train_split parameter works."""
        create_test_dataset(annotation_service, sample_image_bytes, num_images=10)
        zip_path = export_service.export_yolo_zip(train_split=0.5)

        with zipfile.ZipFile(zip_path, "r") as zf:
            names = zf.namelist()
            train_images = [n for n in names if "train/images/" in n and n.endswith(".png")]
            val_images = [n for n in names if "val/images/" in n and n.endswith(".png")]
            assert len(train_images) == 5
            assert len(val_images) == 5


class TestCocoExport:
    """Tests for COCO format export."""

    def test_export_coco_creates_file(
        self,
        annotation_service: AnnotationService,
        export_service: ExportService,
        sample_image_bytes: bytes,
        temp_data_dir: Path,
    ) -> None:
        """Test that COCO export creates a JSON file."""
        create_test_dataset(annotation_service, sample_image_bytes)
        output_path = temp_data_dir / "coco.json"
        result = export_service.export_coco(output_path)

        assert result.exists()
        assert result.suffix == ".json"

    def test_export_coco_structure(
        self,
        annotation_service: AnnotationService,
        export_service: ExportService,
        sample_image_bytes: bytes,
        temp_data_dir: Path,
    ) -> None:
        """Test COCO JSON structure."""
        create_test_dataset(annotation_service, sample_image_bytes)
        output_path = temp_data_dir / "coco.json"
        export_service.export_coco(output_path)

        with output_path.open() as f:
            data = json.load(f)

        assert "images" in data
        assert "annotations" in data
        assert "categories" in data

    def test_export_coco_categories(
        self,
        annotation_service: AnnotationService,
        export_service: ExportService,
        sample_image_bytes: bytes,
        temp_data_dir: Path,
    ) -> None:
        """Test COCO categories."""
        create_test_dataset(annotation_service, sample_image_bytes)
        output_path = temp_data_dir / "coco.json"
        export_service.export_coco(output_path)

        with output_path.open() as f:
            data = json.load(f)

        categories = {c["name"] for c in data["categories"]}
        assert categories == {"brand", "price", "product"}

    def test_export_coco_images(
        self,
        annotation_service: AnnotationService,
        export_service: ExportService,
        sample_image_bytes: bytes,
        temp_data_dir: Path,
    ) -> None:
        """Test COCO images data."""
        annotation_service.upload_image("test.png", sample_image_bytes)
        bbox = BoundingBox(x=0.5, y=0.5, width=0.2, height=0.2)
        annotation_service.add_annotation(
            "test.png", AnnotationCreate(label="product", class_id=0, bbox=bbox)
        )

        output_path = temp_data_dir / "coco.json"
        export_service.export_coco(output_path)

        with output_path.open() as f:
            data = json.load(f)

        assert len(data["images"]) == 1
        img = data["images"][0]
        assert img["file_name"] == "test.png"
        assert img["width"] == 100
        assert img["height"] == 100

    def test_export_coco_annotations(
        self,
        annotation_service: AnnotationService,
        export_service: ExportService,
        sample_image_bytes: bytes,
        temp_data_dir: Path,
    ) -> None:
        """Test COCO annotations data."""
        annotation_service.upload_image("test.png", sample_image_bytes)
        # Bbox at center (0.5, 0.5) with size (0.2, 0.2) on 100x100 image
        # COCO bbox should be [40, 40, 20, 20] (x_min, y_min, width, height)
        bbox = BoundingBox(x=0.5, y=0.5, width=0.2, height=0.2)
        annotation_service.add_annotation(
            "test.png", AnnotationCreate(label="product", class_id=0, bbox=bbox)
        )

        output_path = temp_data_dir / "coco.json"
        export_service.export_coco(output_path)

        with output_path.open() as f:
            data = json.load(f)

        assert len(data["annotations"]) == 1
        ann = data["annotations"][0]
        assert ann["bbox"][0] == pytest.approx(40, abs=0.1)  # x_min
        assert ann["bbox"][1] == pytest.approx(40, abs=0.1)  # y_min
        assert ann["bbox"][2] == pytest.approx(20, abs=0.1)  # width
        assert ann["bbox"][3] == pytest.approx(20, abs=0.1)  # height
        assert ann["area"] == pytest.approx(400, abs=1)  # 20 * 20

    def test_export_coco_unique_annotation_ids(
        self,
        annotation_service: AnnotationService,
        export_service: ExportService,
        sample_image_bytes: bytes,
        temp_data_dir: Path,
    ) -> None:
        """Test that COCO annotations have unique IDs."""
        create_test_dataset(annotation_service, sample_image_bytes)
        output_path = temp_data_dir / "coco.json"
        export_service.export_coco(output_path)

        with output_path.open() as f:
            data = json.load(f)

        ids = [ann["id"] for ann in data["annotations"]]
        assert len(ids) == len(set(ids))  # All unique

    def test_export_coco_empty_dataset(
        self,
        export_service: ExportService,
        temp_data_dir: Path,
    ) -> None:
        """Test export with empty dataset."""
        output_path = temp_data_dir / "coco.json"
        export_service.export_coco(output_path)

        with output_path.open() as f:
            data = json.load(f)

        assert data["images"] == []
        assert data["annotations"] == []
        assert data["categories"] == []
