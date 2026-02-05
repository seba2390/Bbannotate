"""Service for managing annotations and images."""

import json
import shutil
import uuid
from pathlib import Path

from PIL import Image

from src.models.annotations import (
    Annotation,
    AnnotationCreate,
    AnnotationUpdate,
    ImageInfo,
    ImageMetadata,
    ProjectInfo,
)
from src.utils import sanitize_filename


class AnnotationService:
    """Handles image and annotation storage operations."""

    def __init__(self, data_dir: Path) -> None:
        """Initialize the annotation service.

        Args:
            data_dir: Root directory for storing images and annotations.
        """
        self.data_dir = data_dir
        self.images_dir = data_dir / "images"
        self.annotations_dir = data_dir / "annotations"
        self._ensure_directories()

    def _ensure_directories(self) -> None:
        """Create necessary directories if they don't exist."""
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.images_dir.mkdir(exist_ok=True)
        self.annotations_dir.mkdir(exist_ok=True)

    def _get_annotation_path(self, image_filename: str) -> Path:
        """Get the path to the annotation JSON file for an image."""
        stem = Path(image_filename).stem
        return self.annotations_dir / f"{stem}.json"

    def _load_metadata(self, image_filename: str) -> ImageMetadata | None:
        """Load metadata for an image from JSON file."""
        annotation_path = self._get_annotation_path(image_filename)
        if not annotation_path.exists():
            return None
        with annotation_path.open("r") as f:
            data = json.load(f)
        return ImageMetadata.model_validate(data)

    def _save_metadata(self, metadata: ImageMetadata) -> None:
        """Save metadata to JSON file."""
        annotation_path = self._get_annotation_path(metadata.image.filename)
        with annotation_path.open("w") as f:
            json.dump(metadata.model_dump(), f, indent=2)

    def get_project_info(self) -> ProjectInfo:
        """Get project-level statistics and label information."""
        labels: set[str] = set()
        total_annotations = 0
        image_count = 0
        annotated_image_count = 0
        done_image_count = 0

        for annotation_file in self.annotations_dir.glob("*.json"):
            with annotation_file.open("r") as f:
                data = json.load(f)
            metadata = ImageMetadata.model_validate(data)
            image_count += 1
            annotation_count = len(metadata.annotations)
            total_annotations += annotation_count
            if annotation_count > 0:
                annotated_image_count += 1
            if metadata.done:
                done_image_count += 1
            for ann in metadata.annotations:
                labels.add(ann.label)

        return ProjectInfo(
            labels=sorted(labels),
            image_count=image_count,
            annotation_count=total_annotations,
            annotated_image_count=annotated_image_count,
            done_image_count=done_image_count,
        )

    def list_images(self) -> list[str]:
        """List all image filenames in the project."""
        extensions = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
        images = []
        for img_path in self.images_dir.iterdir():
            if img_path.suffix.lower() in extensions:
                images.append(img_path.name)
        return sorted(images)

    def upload_image(self, filename: str, content: bytes) -> ImageInfo:
        """Upload and store an image.

        Args:
            filename: Original filename.
            content: Image file bytes.

        Returns:
            ImageInfo with dimensions.

        Raises:
            ValueError: If the file is not a valid image.
        """
        # Validate and get image dimensions
        from io import BytesIO

        try:
            img = Image.open(BytesIO(content))
            img.verify()  # Verify it's a valid image
            img = Image.open(BytesIO(content))  # Re-open after verify
            width, height = img.size
        except Exception as err:
            raise ValueError(f"Invalid image file: {err}") from err

        # Save image
        safe_filename = sanitize_filename(filename)
        image_path = self.images_dir / safe_filename

        # Handle duplicate filenames
        if image_path.exists():
            stem = image_path.stem
            suffix = image_path.suffix
            counter = 1
            while image_path.exists():
                safe_filename = f"{stem}_{counter}{suffix}"
                image_path = self.images_dir / safe_filename
                counter += 1

        image_path.write_bytes(content)

        # Create initial metadata
        image_info = ImageInfo(filename=safe_filename, width=width, height=height)
        metadata = ImageMetadata(image=image_info, annotations=[])
        self._save_metadata(metadata)

        return image_info

    def get_image_path(self, filename: str) -> Path | None:
        """Get the full path to an image file."""
        path = self.images_dir / filename
        if path.exists() and path.is_file():
            return path
        return None

    def delete_image(self, filename: str) -> bool:
        """Delete an image and its annotations."""
        image_path = self.images_dir / filename
        annotation_path = self._get_annotation_path(filename)

        deleted = False
        if image_path.exists():
            image_path.unlink()
            deleted = True
        if annotation_path.exists():
            annotation_path.unlink()
            deleted = True

        return deleted

    def mark_image_done(self, filename: str, done: bool = True) -> bool:
        """Mark an image as done (annotation complete).

        Args:
            filename: The image filename.
            done: Whether the image is done (default True).

        Returns:
            True if the image was found and updated, False otherwise.
        """
        metadata = self._load_metadata(filename)
        if metadata is None:
            return False
        metadata.done = done
        self._save_metadata(metadata)
        return True

    def get_image_done_status(self, filename: str) -> bool | None:
        """Get the done status of an image.

        Returns:
            True/False if image exists, None if not found.
        """
        metadata = self._load_metadata(filename)
        if metadata is None:
            return None
        return metadata.done

    def get_all_done_status(self) -> dict[str, bool]:
        """Get done status for all images.

        Returns:
            Dictionary mapping filename to done status.
        """
        result: dict[str, bool] = {}
        for annotation_file in self.annotations_dir.glob("*.json"):
            with annotation_file.open("r") as f:
                data = json.load(f)
            metadata = ImageMetadata.model_validate(data)
            result[metadata.image.filename] = metadata.done
        return result

    def get_annotations(self, image_filename: str) -> list[Annotation]:
        """Get all annotations for an image."""
        metadata = self._load_metadata(image_filename)
        if metadata is None:
            return []
        return metadata.annotations

    def add_annotation(
        self, image_filename: str, annotation: AnnotationCreate
    ) -> Annotation:
        """Add a new annotation to an image.

        Args:
            image_filename: The image to annotate.
            annotation: The annotation data.

        Returns:
            The created annotation with generated ID.

        Raises:
            FileNotFoundError: If the image doesn't exist.
        """
        metadata = self._load_metadata(image_filename)
        if metadata is None:
            image_path = self.images_dir / image_filename
            if not image_path.exists():
                raise FileNotFoundError(f"Image not found: {image_filename}")
            # Create metadata if missing
            img = Image.open(image_path)
            image_info = ImageInfo(
                filename=image_filename, width=img.width, height=img.height
            )
            metadata = ImageMetadata(image=image_info, annotations=[])

        new_annotation = Annotation(
            id=str(uuid.uuid4()),
            label=annotation.label,
            class_id=annotation.class_id,
            bbox=annotation.bbox,
        )
        metadata.annotations.append(new_annotation)
        self._save_metadata(metadata)

        return new_annotation

    def update_annotation(
        self, image_filename: str, annotation_id: str, update: AnnotationUpdate
    ) -> Annotation | None:
        """Update an existing annotation."""
        metadata = self._load_metadata(image_filename)
        if metadata is None:
            return None

        for i, ann in enumerate(metadata.annotations):
            if ann.id == annotation_id:
                updated_data = ann.model_dump()
                update_dict = update.model_dump(exclude_none=True)
                updated_data.update(update_dict)
                metadata.annotations[i] = Annotation.model_validate(updated_data)
                self._save_metadata(metadata)
                return metadata.annotations[i]

        return None

    def delete_annotation(self, image_filename: str, annotation_id: str) -> bool:
        """Delete an annotation from an image."""
        metadata = self._load_metadata(image_filename)
        if metadata is None:
            return False

        original_count = len(metadata.annotations)
        metadata.annotations = [
            ann for ann in metadata.annotations if ann.id != annotation_id
        ]

        if len(metadata.annotations) < original_count:
            self._save_metadata(metadata)
            return True

        return False

    def clear_annotations(self, image_filename: str) -> int:
        """Clear all annotations for an image."""
        metadata = self._load_metadata(image_filename)
        if metadata is None:
            return 0

        count = len(metadata.annotations)
        metadata.annotations = []
        self._save_metadata(metadata)

        return count

    def copy_annotations(self, source_filename: str, target_filename: str) -> int:
        """Copy annotations from one image to another.

        Useful for batch operations on similar flyer pages.
        """
        source_metadata = self._load_metadata(source_filename)
        if source_metadata is None:
            return 0

        target_metadata = self._load_metadata(target_filename)
        if target_metadata is None:
            return 0

        # Generate new IDs for copied annotations
        copied_annotations = []
        for ann in source_metadata.annotations:
            copied = Annotation(
                id=str(uuid.uuid4()),
                label=ann.label,
                class_id=ann.class_id,
                bbox=ann.bbox,
            )
            copied_annotations.append(copied)

        target_metadata.annotations.extend(copied_annotations)
        self._save_metadata(target_metadata)

        return len(copied_annotations)

    def backup_project(self, backup_path: Path) -> Path:
        """Create a backup of the entire project.

        Only backs up the images and annotations directories to avoid
        infinite recursion when backup_path is inside data_dir.
        """
        backup_path.mkdir(parents=True, exist_ok=True)
        backup_dir = backup_path / f"backup_{uuid.uuid4().hex[:8]}"
        backup_dir.mkdir(parents=True, exist_ok=True)

        # Copy only images and annotations directories
        if self.images_dir.exists():
            shutil.copytree(self.images_dir, backup_dir / "images")
        else:
            (backup_dir / "images").mkdir()

        if self.annotations_dir.exists():
            shutil.copytree(self.annotations_dir, backup_dir / "annotations")
        else:
            (backup_dir / "annotations").mkdir()

        return backup_dir
