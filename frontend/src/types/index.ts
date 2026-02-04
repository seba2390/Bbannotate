/** Bounding box with normalized coordinates (0-1) */
export interface BoundingBox {
  x: number; // Center X (normalized)
  y: number; // Center Y (normalized)
  width: number; // Width (normalized)
  height: number; // Height (normalized)
}

/** A single annotation on an image */
export interface Annotation {
  id: string;
  label: string;
  class_id: number;
  bbox: BoundingBox;
}

/** Request to create a new annotation */
export interface AnnotationCreate {
  label: string;
  class_id: number;
  bbox: BoundingBox;
}

/** Request to update an annotation */
export interface AnnotationUpdate {
  label?: string;
  class_id?: number;
  bbox?: BoundingBox;
}

/** Basic image information */
export interface ImageInfo {
  filename: string;
  width: number;
  height: number;
}

/** Project-level information */
export interface ProjectInfo {
  name: string;
  labels: string[];
  image_count: number;
  annotation_count: number;
  annotated_image_count: number;
}

/** Project (for project manager) */
export interface Project {
  id: string;
  name: string;
  created_at: string;
  last_opened: string;
  image_count: number;
  annotation_count: number;
}

/** Request to create a project */
export interface ProjectCreate {
  name: string;
}

/** Rectangle for drawing (pixel coordinates) */
export interface DrawingRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Tool modes for the canvas */
export type ToolMode = 'select' | 'draw' | 'pan';
