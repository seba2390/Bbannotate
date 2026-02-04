"""Service for exporting annotations to various formats."""

import shutil
import zipfile
from pathlib import Path

from src.services.annotation_service import AnnotationService


class ExportService:
    """Handles exporting annotations to training-ready formats."""

    def __init__(self, annotation_service: AnnotationService) -> None:
        """Initialize the export service.

        Args:
            annotation_service: Service for accessing annotations.
        """
        self.annotation_service = annotation_service

    def _get_all_labels(self) -> list[str]:
        """Get sorted list of all unique labels in the project."""
        labels: set[str] = set()
        for filename in self.annotation_service.list_images():
            annotations = self.annotation_service.get_annotations(filename)
            for ann in annotations:
                labels.add(ann.label)
        return sorted(labels)

    def export_yolo(self, output_dir: Path, train_split: float = 0.8) -> Path:
        """Export annotations in YOLO format.

        Creates the standard YOLO directory structure:
        output_dir/
        ├── data.yaml
        ├── train/
        │   ├── images/
        │   └── labels/
        └── val/
            ├── images/
            └── labels/

        Args:
            output_dir: Directory to export to.
            train_split: Fraction of data for training (0-1).

        Returns:
            Path to the created data.yaml file.
        """
        output_dir.mkdir(parents=True, exist_ok=True)

        # Create directory structure
        train_images = output_dir / "train" / "images"
        train_labels = output_dir / "train" / "labels"
        val_images = output_dir / "val" / "images"
        val_labels = output_dir / "val" / "labels"

        for d in [train_images, train_labels, val_images, val_labels]:
            d.mkdir(parents=True, exist_ok=True)

        # Get all images and split
        images = self.annotation_service.list_images()
        split_idx = int(len(images) * train_split)
        train_files = images[:split_idx]
        val_files = images[split_idx:]

        # Build label mapping from project
        labels = self._get_all_labels()
        label_to_id = {label: idx for idx, label in enumerate(labels)}

        # Export training set
        for filename in train_files:
            self._export_yolo_image(filename, train_images, train_labels, label_to_id)

        # Export validation set
        for filename in val_files:
            self._export_yolo_image(filename, val_images, val_labels, label_to_id)

        # Create data.yaml
        data_yaml = output_dir / "data.yaml"
        yaml_content = self._create_yolo_yaml(output_dir, labels)
        data_yaml.write_text(yaml_content)

        return data_yaml

    def _export_yolo_image(
        self,
        filename: str,
        images_dir: Path,
        labels_dir: Path,
        label_to_id: dict[str, int],
    ) -> None:
        """Export a single image and its annotations in YOLO format."""
        # Copy image
        source_path = self.annotation_service.get_image_path(filename)
        if source_path is None:
            return

        shutil.copy(source_path, images_dir / filename)

        # Create label file
        annotations = self.annotation_service.get_annotations(filename)
        label_path = labels_dir / f"{Path(filename).stem}.txt"

        lines = []
        for ann in annotations:
            class_id = label_to_id.get(ann.label, ann.class_id)
            # YOLO format: class_id center_x center_y width height (all normalized)
            line = f"{class_id} {ann.bbox.x:.6f} {ann.bbox.y:.6f} {ann.bbox.width:.6f} {ann.bbox.height:.6f}"
            lines.append(line)

        label_path.write_text("\n".join(lines))

    def _create_yolo_yaml(self, output_dir: Path, labels: list[str]) -> str:
        """Create YOLO data.yaml content."""
        lines = [
            f"path: {output_dir.absolute()}",
            "train: train/images",
            "val: val/images",
            "",
            f"nc: {len(labels)}",
            "names:",
        ]
        for i, label in enumerate(labels):
            lines.append(f"  {i}: {label}")

        return "\n".join(lines) + "\n"

    def export_yolo_zip(self, train_split: float = 0.8) -> Path:
        """Export annotations as a ZIP file for easy download.

        Args:
            train_split: Fraction of data for training (0-1).

        Returns:
            Path to the created ZIP file.
        """
        import tempfile

        # Create temporary directory for export
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            export_dir = temp_path / "yolo_dataset"
            self.export_yolo(export_dir, train_split)

            # Create zip file in data directory
            zip_path = self.annotation_service.data_dir / "yolo_export.zip"
            with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
                for file_path in export_dir.rglob("*"):
                    if file_path.is_file():
                        arcname = file_path.relative_to(export_dir)
                        zipf.write(file_path, arcname)

        return zip_path

    def export_coco(self, output_path: Path) -> Path:
        """Export annotations in COCO JSON format.

        Args:
            output_path: Path for the output JSON file.

        Returns:
            Path to the created JSON file.
        """
        import json

        labels = self._get_all_labels()
        categories = [
            {"id": idx, "name": label, "supercategory": "product"}
            for idx, label in enumerate(labels)
        ]

        images_data = []
        annotations_data = []
        annotation_id = 1

        for img_id, filename in enumerate(self.annotation_service.list_images()):
            annotations = self.annotation_service.get_annotations(filename)
            metadata = self.annotation_service._load_metadata(filename)

            if metadata is None:
                continue

            images_data.append(
                {
                    "id": img_id,
                    "file_name": filename,
                    "width": metadata.image.width,
                    "height": metadata.image.height,
                }
            )

            for ann in annotations:
                # Convert from normalized center format to absolute corner format
                width_px = ann.bbox.width * metadata.image.width
                height_px = ann.bbox.height * metadata.image.height
                x_min = (ann.bbox.x - ann.bbox.width / 2) * metadata.image.width
                y_min = (ann.bbox.y - ann.bbox.height / 2) * metadata.image.height

                annotations_data.append(
                    {
                        "id": annotation_id,
                        "image_id": img_id,
                        "category_id": labels.index(ann.label),
                        "bbox": [x_min, y_min, width_px, height_px],
                        "area": width_px * height_px,
                        "iscrowd": 0,
                    }
                )
                annotation_id += 1

        coco_data = {
            "images": images_data,
            "annotations": annotations_data,
            "categories": categories,
        }

        output_path.parent.mkdir(parents=True, exist_ok=True)
        with output_path.open("w") as f:
            json.dump(coco_data, f, indent=2)

        return output_path

    def export_pascal_voc(self, output_dir: Path) -> Path:
        """Export annotations in Pascal VOC XML format.

        Creates XML files per image with the standard VOC structure.

        Args:
            output_dir: Directory to export to.

        Returns:
            Path to the output directory.
        """
        from xml.etree import ElementTree as ET

        output_dir.mkdir(parents=True, exist_ok=True)
        annotations_dir = output_dir / "Annotations"
        images_dir = output_dir / "JPEGImages"
        annotations_dir.mkdir(exist_ok=True)
        images_dir.mkdir(exist_ok=True)

        for filename in self.annotation_service.list_images():
            annotations = self.annotation_service.get_annotations(filename)
            metadata = self.annotation_service._load_metadata(filename)
            source_path = self.annotation_service.get_image_path(filename)

            if metadata is None or source_path is None:
                continue

            # Copy image
            shutil.copy(source_path, images_dir / filename)

            # Create XML annotation
            root = ET.Element("annotation")
            ET.SubElement(root, "folder").text = "JPEGImages"
            ET.SubElement(root, "filename").text = filename

            size = ET.SubElement(root, "size")
            ET.SubElement(size, "width").text = str(metadata.image.width)
            ET.SubElement(size, "height").text = str(metadata.image.height)
            ET.SubElement(size, "depth").text = "3"

            ET.SubElement(root, "segmented").text = "0"

            for ann in annotations:
                obj = ET.SubElement(root, "object")
                ET.SubElement(obj, "name").text = ann.label
                ET.SubElement(obj, "pose").text = "Unspecified"
                ET.SubElement(obj, "truncated").text = "0"
                ET.SubElement(obj, "difficult").text = "0"

                # Convert from normalized center format to absolute corner format
                x_min = int(
                    (ann.bbox.x - ann.bbox.width / 2) * metadata.image.width
                )
                y_min = int(
                    (ann.bbox.y - ann.bbox.height / 2) * metadata.image.height
                )
                x_max = int(
                    (ann.bbox.x + ann.bbox.width / 2) * metadata.image.width
                )
                y_max = int(
                    (ann.bbox.y + ann.bbox.height / 2) * metadata.image.height
                )

                bndbox = ET.SubElement(obj, "bndbox")
                ET.SubElement(bndbox, "xmin").text = str(max(0, x_min))
                ET.SubElement(bndbox, "ymin").text = str(max(0, y_min))
                ET.SubElement(bndbox, "xmax").text = str(
                    min(metadata.image.width, x_max)
                )
                ET.SubElement(bndbox, "ymax").text = str(
                    min(metadata.image.height, y_max)
                )

            # Write XML file
            tree = ET.ElementTree(root)
            xml_path = annotations_dir / f"{Path(filename).stem}.xml"
            tree.write(xml_path, encoding="unicode", xml_declaration=True)

        return output_dir

    def export_pascal_voc_zip(self) -> Path:
        """Export Pascal VOC annotations as a ZIP file.

        Returns:
            Path to the created ZIP file.
        """
        import tempfile

        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            export_dir = temp_path / "pascal_voc_dataset"
            self.export_pascal_voc(export_dir)

            zip_path = self.annotation_service.data_dir / "pascal_voc_export.zip"
            with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
                for file_path in export_dir.rglob("*"):
                    if file_path.is_file():
                        arcname = file_path.relative_to(export_dir)
                        zipf.write(file_path, arcname)

        return zip_path

    def export_createml(self, output_path: Path) -> Path:
        """Export annotations in Apple CreateML JSON format.

        Args:
            output_path: Path for the output JSON file.

        Returns:
            Path to the created JSON file.
        """
        import json

        createml_data = []

        for filename in self.annotation_service.list_images():
            annotations = self.annotation_service.get_annotations(filename)
            metadata = self.annotation_service._load_metadata(filename)

            if metadata is None:
                continue

            image_annotations = []
            for ann in annotations:
                # CreateML uses center-based coordinates with absolute pixels
                width_px = ann.bbox.width * metadata.image.width
                height_px = ann.bbox.height * metadata.image.height
                center_x = ann.bbox.x * metadata.image.width
                center_y = ann.bbox.y * metadata.image.height

                image_annotations.append(
                    {
                        "label": ann.label,
                        "coordinates": {
                            "x": round(center_x, 2),
                            "y": round(center_y, 2),
                            "width": round(width_px, 2),
                            "height": round(height_px, 2),
                        },
                    }
                )

            createml_data.append(
                {"image": filename, "annotations": image_annotations}
            )

        output_path.parent.mkdir(parents=True, exist_ok=True)
        with output_path.open("w") as f:
            json.dump(createml_data, f, indent=2)

        return output_path

    def export_csv(self, output_path: Path) -> Path:
        """Export annotations in CSV format.

        Format: image_filename,label,x_min,y_min,x_max,y_max,width,height

        Args:
            output_path: Path for the output CSV file.

        Returns:
            Path to the created CSV file.
        """
        import csv

        output_path.parent.mkdir(parents=True, exist_ok=True)

        with output_path.open("w", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(
                [
                    "filename",
                    "label",
                    "x_min",
                    "y_min",
                    "x_max",
                    "y_max",
                    "image_width",
                    "image_height",
                ]
            )

            for filename in self.annotation_service.list_images():
                annotations = self.annotation_service.get_annotations(filename)
                metadata = self.annotation_service._load_metadata(filename)

                if metadata is None:
                    continue

                for ann in annotations:
                    x_min = int(
                        (ann.bbox.x - ann.bbox.width / 2) * metadata.image.width
                    )
                    y_min = int(
                        (ann.bbox.y - ann.bbox.height / 2) * metadata.image.height
                    )
                    x_max = int(
                        (ann.bbox.x + ann.bbox.width / 2) * metadata.image.width
                    )
                    y_max = int(
                        (ann.bbox.y + ann.bbox.height / 2) * metadata.image.height
                    )

                    writer.writerow(
                        [
                            filename,
                            ann.label,
                            max(0, x_min),
                            max(0, y_min),
                            min(metadata.image.width, x_max),
                            min(metadata.image.height, y_max),
                            metadata.image.width,
                            metadata.image.height,
                        ]
                    )

        return output_path
