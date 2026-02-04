"""Tests for Pydantic models."""

import pytest
from pydantic import ValidationError

from src.models.annotations import (
    Annotation,
    AnnotationCreate,
    AnnotationUpdate,
    BoundingBox,
    ImageInfo,
    ImageMetadata,
    ProjectInfo,
)


class TestBoundingBox:
    """Tests for the BoundingBox model."""

    def test_valid_bounding_box(self) -> None:
        """Test creating a valid bounding box."""
        bbox = BoundingBox(x=0.5, y=0.5, width=0.2, height=0.3)
        assert bbox.x == 0.5
        assert bbox.y == 0.5
        assert bbox.width == 0.2
        assert bbox.height == 0.3

    def test_bounding_box_at_origin(self) -> None:
        """Test bounding box at origin (0,0)."""
        bbox = BoundingBox(x=0.0, y=0.0, width=0.1, height=0.1)
        assert bbox.x == 0.0
        assert bbox.y == 0.0

    def test_bounding_box_at_max(self) -> None:
        """Test bounding box at maximum values."""
        bbox = BoundingBox(x=1.0, y=1.0, width=1.0, height=1.0)
        assert bbox.x == 1.0
        assert bbox.y == 1.0

    def test_bounding_box_negative_x_fails(self) -> None:
        """Test that negative x value fails validation."""
        with pytest.raises(ValidationError) as exc_info:
            BoundingBox(x=-0.1, y=0.5, width=0.2, height=0.2)
        assert "x" in str(exc_info.value)

    def test_bounding_box_negative_y_fails(self) -> None:
        """Test that negative y value fails validation."""
        with pytest.raises(ValidationError) as exc_info:
            BoundingBox(x=0.5, y=-0.1, width=0.2, height=0.2)
        assert "y" in str(exc_info.value)

    def test_bounding_box_x_exceeds_one_fails(self) -> None:
        """Test that x > 1 fails validation."""
        with pytest.raises(ValidationError) as exc_info:
            BoundingBox(x=1.1, y=0.5, width=0.2, height=0.2)
        assert "x" in str(exc_info.value)

    def test_bounding_box_y_exceeds_one_fails(self) -> None:
        """Test that y > 1 fails validation."""
        with pytest.raises(ValidationError) as exc_info:
            BoundingBox(x=0.5, y=1.1, width=0.2, height=0.2)
        assert "y" in str(exc_info.value)

    def test_bounding_box_negative_width_fails(self) -> None:
        """Test that negative width fails validation."""
        with pytest.raises(ValidationError) as exc_info:
            BoundingBox(x=0.5, y=0.5, width=-0.1, height=0.2)
        assert "width" in str(exc_info.value)

    def test_bounding_box_negative_height_fails(self) -> None:
        """Test that negative height fails validation."""
        with pytest.raises(ValidationError) as exc_info:
            BoundingBox(x=0.5, y=0.5, width=0.2, height=-0.1)
        assert "height" in str(exc_info.value)

    def test_bounding_box_serialization(self) -> None:
        """Test bounding box serialization to dict."""
        bbox = BoundingBox(x=0.5, y=0.5, width=0.2, height=0.3)
        data = bbox.model_dump()
        assert data == {"x": 0.5, "y": 0.5, "width": 0.2, "height": 0.3}

    def test_bounding_box_deserialization(self) -> None:
        """Test bounding box deserialization from dict."""
        data = {"x": 0.5, "y": 0.5, "width": 0.2, "height": 0.3}
        bbox = BoundingBox.model_validate(data)
        assert bbox.x == 0.5
        assert bbox.width == 0.2


class TestAnnotation:
    """Tests for the Annotation model."""

    def test_valid_annotation(self) -> None:
        """Test creating a valid annotation."""
        bbox = BoundingBox(x=0.5, y=0.5, width=0.2, height=0.2)
        ann = Annotation(id="test-id", label="product", class_id=0, bbox=bbox)
        assert ann.id == "test-id"
        assert ann.label == "product"
        assert ann.class_id == 0
        assert ann.bbox == bbox

    def test_annotation_negative_class_id_fails(self) -> None:
        """Test that negative class_id fails validation."""
        bbox = BoundingBox(x=0.5, y=0.5, width=0.2, height=0.2)
        with pytest.raises(ValidationError) as exc_info:
            Annotation(id="test-id", label="product", class_id=-1, bbox=bbox)
        assert "class_id" in str(exc_info.value)

    def test_annotation_serialization(self) -> None:
        """Test annotation serialization."""
        bbox = BoundingBox(x=0.5, y=0.5, width=0.2, height=0.2)
        ann = Annotation(id="test-id", label="product", class_id=0, bbox=bbox)
        data = ann.model_dump()
        assert data["id"] == "test-id"
        assert data["label"] == "product"
        assert data["bbox"]["x"] == 0.5


class TestAnnotationCreate:
    """Tests for the AnnotationCreate model."""

    def test_valid_annotation_create(self) -> None:
        """Test creating a valid annotation create request."""
        bbox = BoundingBox(x=0.5, y=0.5, width=0.2, height=0.2)
        create = AnnotationCreate(label="product", class_id=0, bbox=bbox)
        assert create.label == "product"
        assert create.class_id == 0

    def test_annotation_create_empty_label_fails(self) -> None:
        """Test that empty label fails validation."""
        bbox = BoundingBox(x=0.5, y=0.5, width=0.2, height=0.2)
        with pytest.raises(ValidationError) as exc_info:
            AnnotationCreate(label="", class_id=0, bbox=bbox)
        assert "label" in str(exc_info.value)

    def test_annotation_create_negative_class_id_fails(self) -> None:
        """Test that negative class_id fails validation."""
        bbox = BoundingBox(x=0.5, y=0.5, width=0.2, height=0.2)
        with pytest.raises(ValidationError) as exc_info:
            AnnotationCreate(label="product", class_id=-1, bbox=bbox)
        assert "class_id" in str(exc_info.value)


class TestAnnotationUpdate:
    """Tests for the AnnotationUpdate model."""

    def test_annotation_update_partial(self) -> None:
        """Test partial update with only label."""
        update = AnnotationUpdate(label="price")
        assert update.label == "price"
        assert update.class_id is None
        assert update.bbox is None

    def test_annotation_update_all_fields(self) -> None:
        """Test update with all fields."""
        bbox = BoundingBox(x=0.6, y=0.6, width=0.3, height=0.3)
        update = AnnotationUpdate(label="price", class_id=1, bbox=bbox)
        assert update.label == "price"
        assert update.class_id == 1
        assert update.bbox == bbox

    def test_annotation_update_empty(self) -> None:
        """Test empty update (no fields)."""
        update = AnnotationUpdate()
        assert update.label is None
        assert update.class_id is None
        assert update.bbox is None

    def test_annotation_update_empty_label_fails(self) -> None:
        """Test that empty string label fails validation."""
        with pytest.raises(ValidationError) as exc_info:
            AnnotationUpdate(label="")
        assert "label" in str(exc_info.value)


class TestImageInfo:
    """Tests for the ImageInfo model."""

    def test_valid_image_info(self) -> None:
        """Test creating valid image info."""
        info = ImageInfo(filename="test.png", width=800, height=600)
        assert info.filename == "test.png"
        assert info.width == 800
        assert info.height == 600

    def test_image_info_serialization(self) -> None:
        """Test image info serialization."""
        info = ImageInfo(filename="test.png", width=800, height=600)
        data = info.model_dump()
        assert data == {"filename": "test.png", "width": 800, "height": 600}


class TestImageMetadata:
    """Tests for the ImageMetadata model."""

    def test_image_metadata_empty_annotations(self) -> None:
        """Test image metadata with no annotations."""
        info = ImageInfo(filename="test.png", width=800, height=600)
        metadata = ImageMetadata(image=info)
        assert metadata.image == info
        assert metadata.annotations == []

    def test_image_metadata_with_annotations(self) -> None:
        """Test image metadata with annotations."""
        info = ImageInfo(filename="test.png", width=800, height=600)
        bbox = BoundingBox(x=0.5, y=0.5, width=0.2, height=0.2)
        ann = Annotation(id="test-id", label="product", class_id=0, bbox=bbox)
        metadata = ImageMetadata(image=info, annotations=[ann])
        assert len(metadata.annotations) == 1
        assert metadata.annotations[0].label == "product"

    def test_image_metadata_serialization_roundtrip(self) -> None:
        """Test serialization and deserialization roundtrip."""
        info = ImageInfo(filename="test.png", width=800, height=600)
        bbox = BoundingBox(x=0.5, y=0.5, width=0.2, height=0.2)
        ann = Annotation(id="test-id", label="product", class_id=0, bbox=bbox)
        metadata = ImageMetadata(image=info, annotations=[ann])

        # Serialize
        data = metadata.model_dump()

        # Deserialize
        restored = ImageMetadata.model_validate(data)

        assert restored.image.filename == "test.png"
        assert len(restored.annotations) == 1
        assert restored.annotations[0].id == "test-id"


class TestProjectInfo:
    """Tests for the ProjectInfo model."""

    def test_project_info_defaults(self) -> None:
        """Test project info with default values."""
        info = ProjectInfo()
        assert info.name == "grocery-flyer-annotations"
        assert info.labels == []
        assert info.image_count == 0
        assert info.annotation_count == 0

    def test_project_info_with_data(self) -> None:
        """Test project info with data."""
        info = ProjectInfo(
            name="my-project",
            labels=["product", "price"],
            image_count=10,
            annotation_count=50,
        )
        assert info.name == "my-project"
        assert info.labels == ["product", "price"]
        assert info.image_count == 10
        assert info.annotation_count == 50
