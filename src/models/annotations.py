"""Pydantic models for annotation data."""

from pydantic import BaseModel, Field


class BoundingBox(BaseModel):
    """Represents a bounding box with normalized coordinates (0-1)."""

    x: float = Field(..., ge=0, le=1, description="Center X coordinate (normalized)")
    y: float = Field(..., ge=0, le=1, description="Center Y coordinate (normalized)")
    width: float = Field(..., ge=0, le=1, description="Box width (normalized)")
    height: float = Field(..., ge=0, le=1, description="Box height (normalized)")


class Annotation(BaseModel):
    """A single annotation with bounding box and label."""

    id: str = Field(..., description="Unique identifier for the annotation")
    label: str = Field(..., description="Class label for the annotation")
    class_id: int = Field(..., ge=0, description="Numeric class ID for YOLO export")
    bbox: BoundingBox = Field(..., description="Bounding box coordinates")


class AnnotationCreate(BaseModel):
    """Request model for creating an annotation."""

    label: str = Field(..., min_length=1, description="Class label")
    class_id: int = Field(..., ge=0, description="Numeric class ID")
    bbox: BoundingBox


class AnnotationUpdate(BaseModel):
    """Request model for updating an annotation."""

    label: str | None = Field(None, min_length=1)
    class_id: int | None = Field(None, ge=0)
    bbox: BoundingBox | None = None


class ImageInfo(BaseModel):
    """Basic image information."""

    filename: str
    width: int
    height: int


class ImageMetadata(BaseModel):
    """Complete metadata for an annotated image."""

    image: ImageInfo
    annotations: list[Annotation] = Field(default_factory=list)
    done: bool = Field(
        default=False, description="Whether the image annotation is complete"
    )


class ProjectInfo(BaseModel):
    """Project-level information."""

    name: str = Field(default="grocery-flyer-annotations")
    labels: list[str] = Field(default_factory=list)
    image_count: int = 0
    annotation_count: int = 0
    annotated_image_count: int = 0
    done_image_count: int = Field(
        default=0, description="Number of images marked as done"
    )
