"""Data models for the annotation tool."""

from src.models.annotations import (
    Annotation,
    AnnotationCreate,
    AnnotationUpdate,
    BoundingBox,
    ImageInfo,
    ImageMetadata,
    ProjectInfo,
)

__all__ = [
    "Annotation",
    "AnnotationCreate",
    "AnnotationUpdate",
    "BoundingBox",
    "ImageInfo",
    "ImageMetadata",
    "ProjectInfo",
]
