import axios from 'axios';
import type {
  Annotation,
  AnnotationCreate,
  AnnotationUpdate,
  ImageInfo,
  Project,
  ProjectCreate,
  ProjectInfo,
} from '@/types';

const api = axios.create({
  baseURL: '/api',
});

/** Project Management API */
export async function listProjects(): Promise<Project[]> {
  const response = await api.get<Project[]>('/projects');
  return response.data;
}

export async function createProject(create: ProjectCreate): Promise<Project> {
  const response = await api.post<Project>('/projects', create);
  return response.data;
}

export async function getCurrentProject(): Promise<Project | null> {
  const response = await api.get<Project | null>('/projects/current');
  return response.data;
}

export async function openProject(projectId: string): Promise<Project> {
  const response = await api.post<Project>(`/projects/${encodeURIComponent(projectId)}/open`);
  return response.data;
}

export async function closeProject(): Promise<void> {
  await api.post('/projects/close');
}

export async function deleteProject(projectId: string): Promise<void> {
  await api.delete(`/projects/${encodeURIComponent(projectId)}`);
}

/** Project Info API */
export async function getProjectInfo(): Promise<ProjectInfo> {
  const response = await api.get<ProjectInfo>('/project');
  return response.data;
}

/** Image API */
export async function listImages(): Promise<string[]> {
  const response = await api.get<string[]>('/images');
  return response.data;
}

export async function uploadImage(file: File): Promise<ImageInfo> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post<ImageInfo>('/images', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

export async function uploadImages(files: File[]): Promise<ImageInfo[]> {
  const results: ImageInfo[] = [];
  for (const file of files) {
    const info = await uploadImage(file);
    results.push(info);
  }
  return results;
}

export function getImageUrl(filename: string): string {
  return `/api/images/${encodeURIComponent(filename)}`;
}

export async function deleteImage(filename: string): Promise<void> {
  await api.delete(`/images/${encodeURIComponent(filename)}`);
}

/** Annotation API */
export async function getAnnotations(filename: string): Promise<Annotation[]> {
  const response = await api.get<Annotation[]>(
    `/images/${encodeURIComponent(filename)}/annotations`
  );
  return response.data;
}

export async function addAnnotation(
  filename: string,
  annotation: AnnotationCreate
): Promise<Annotation> {
  const response = await api.post<Annotation>(
    `/images/${encodeURIComponent(filename)}/annotations`,
    annotation
  );
  return response.data;
}

export async function updateAnnotation(
  filename: string,
  annotationId: string,
  update: AnnotationUpdate
): Promise<Annotation> {
  const response = await api.put<Annotation>(
    `/images/${encodeURIComponent(filename)}/annotations/${annotationId}`,
    update
  );
  return response.data;
}

export async function deleteAnnotation(filename: string, annotationId: string): Promise<void> {
  await api.delete(`/images/${encodeURIComponent(filename)}/annotations/${annotationId}`);
}

export async function clearAnnotations(filename: string): Promise<number> {
  const response = await api.delete<{ deleted: number }>(
    `/images/${encodeURIComponent(filename)}/annotations`
  );
  return response.data.deleted;
}

export async function copyAnnotations(
  targetFilename: string,
  sourceFilename: string
): Promise<number> {
  const response = await api.post<{ copied: number }>(
    `/images/${encodeURIComponent(targetFilename)}/annotations/copy-from/${encodeURIComponent(sourceFilename)}`
  );
  return response.data.copied;
}

/** Export API */
export type ExportFormat = 'yolo' | 'coco' | 'pascal-voc' | 'createml' | 'csv';

export interface ExportFormatInfo {
  id: ExportFormat;
  name: string;
  description: string;
  fileType: string;
}

export const EXPORT_FORMATS: ExportFormatInfo[] = [
  {
    id: 'yolo',
    name: 'YOLO',
    description: 'Ultralytics YOLO format with train/val/test split',
    fileType: 'ZIP',
  },
  {
    id: 'coco',
    name: 'COCO JSON',
    description: 'Common Objects in Context format (single JSON)',
    fileType: 'JSON',
  },
  {
    id: 'pascal-voc',
    name: 'Pascal VOC',
    description: 'XML annotations per image (ImageNet style)',
    fileType: 'ZIP',
  },
  {
    id: 'createml',
    name: 'CreateML',
    description: 'Apple CreateML format for Core ML training',
    fileType: 'JSON',
  },
  {
    id: 'csv',
    name: 'CSV',
    description: 'Simple CSV with bounding box coordinates',
    fileType: 'CSV',
  },
];

export interface DataSplit {
  train: number;
  val: number;
  test: number;
}

export function getExportUrl(
  format: ExportFormat,
  split: DataSplit = { train: 0.7, val: 0.2, test: 0.1 }
): string {
  switch (format) {
    case 'yolo':
      return `/api/export/yolo?train_split=${split.train}&val_split=${split.val}&test_split=${split.test}`;
    case 'coco':
      return '/api/export/coco';
    case 'pascal-voc':
      return '/api/export/pascal-voc';
    case 'createml':
      return '/api/export/createml';
    case 'csv':
      return '/api/export/csv';
  }
}

export function getYoloExportUrl(split: DataSplit = { train: 0.7, val: 0.2, test: 0.1 }): string {
  return `/api/export/yolo?train_split=${split.train}&val_split=${split.val}&test_split=${split.test}`;
}

export function getCocoExportUrl(): string {
  return '/api/export/coco';
}
