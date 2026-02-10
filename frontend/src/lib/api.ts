import axios from 'axios';
import type {
  Annotation,
  AnnotationCreate,
  AnnotationUpdate,
  ImageInfo,
  Project,
  ProjectCreate,
  ProjectRename,
  ProjectInfo,
} from '@/types';

const api = axios.create({
  baseURL: '/api',
});

// Track current project ID for image URL generation
// (needed because <img> tags cannot include custom headers)
let currentProjectId: string | null = null;

/**
 * Set the current project ID for all subsequent API requests.
 * This is used for thread-safe, per-request project context.
 */
export function setCurrentProjectId(projectId: string | null): void {
  currentProjectId = projectId;
  if (projectId) {
    api.defaults.headers.common['X-Project-Id'] = projectId;
  } else {
    delete api.defaults.headers.common['X-Project-Id'];
  }
}

/** Browser session lifecycle API */
interface BrowserSessionPayload {
  token: string;
}

export async function sendBrowserSessionHeartbeat(token: string): Promise<void> {
  const payload: BrowserSessionPayload = { token };
  await api.post('/session/heartbeat', payload);
}

export function sendBrowserSessionClose(token: string): void {
  const payload: BrowserSessionPayload = { token };
  const body = JSON.stringify(payload);
  const closeUrl = '/api/session/close';

  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    const blob = new Blob([body], { type: 'application/json' });
    navigator.sendBeacon(closeUrl, blob);
    return;
  }

  void fetch(closeUrl, {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
  });
}

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
  // Set header for all subsequent requests
  setCurrentProjectId(projectId);
  return response.data;
}

export async function closeProject(): Promise<void> {
  // Clear header before closing
  setCurrentProjectId(null);
  await api.post('/projects/close');
}

export async function deleteProject(projectId: string): Promise<void> {
  await api.delete(`/projects/${encodeURIComponent(projectId)}`);
}

export async function renameProject(projectId: string, rename: ProjectRename): Promise<Project> {
  const response = await api.patch<Project>(`/projects/${encodeURIComponent(projectId)}`, rename);
  return response.data;
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
  const uploads = files.map((file) => uploadImage(file));
  return Promise.all(uploads);
}

export function getImageUrl(filename: string): string {
  const baseUrl = `/api/images/${encodeURIComponent(filename)}`;
  if (currentProjectId) {
    return `${baseUrl}?project_id=${encodeURIComponent(currentProjectId)}`;
  }
  return baseUrl;
}

export async function deleteImage(filename: string): Promise<void> {
  await api.delete(`/images/${encodeURIComponent(filename)}`);
}

export async function deleteImages(filenames: string[]): Promise<void> {
  await Promise.all(filenames.map((f) => deleteImage(f)));
}

export async function markImageDone(filename: string, done: boolean = true): Promise<void> {
  await api.patch(`/images/${encodeURIComponent(filename)}/done?done=${done}`);
}

export async function getImageDoneStatus(filename: string): Promise<boolean> {
  const response = await api.get<{ done: boolean }>(`/images/${encodeURIComponent(filename)}/done`);
  return response.data.done;
}

export async function getAllDoneStatus(): Promise<Record<string, boolean>> {
  const response = await api.get<Record<string, boolean>>('/images/done-status');
  return response.data;
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
    description: 'Ultralytics YOLO format with train/val split (done images only)',
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
}

export function getExportUrl(
  format: ExportFormat,
  split: DataSplit = { train: 0.8, val: 0.2 }
): string {
  const projectParam = currentProjectId ? `project_id=${encodeURIComponent(currentProjectId)}` : '';
  switch (format) {
    case 'yolo':
      return `/api/export/yolo?train_split=${split.train}&val_split=${split.val}${projectParam ? `&${projectParam}` : ''}`;
    case 'coco':
      return `/api/export/coco${projectParam ? `?${projectParam}` : ''}`;
    case 'pascal-voc':
      return `/api/export/pascal-voc${projectParam ? `?${projectParam}` : ''}`;
    case 'createml':
      return `/api/export/createml${projectParam ? `?${projectParam}` : ''}`;
    case 'csv':
      return `/api/export/csv${projectParam ? `?${projectParam}` : ''}`;
  }
}

export function getYoloExportUrl(split: DataSplit = { train: 0.8, val: 0.2 }): string {
  const projectParam = currentProjectId
    ? `&project_id=${encodeURIComponent(currentProjectId)}`
    : '';
  return `/api/export/yolo?train_split=${split.train}&val_split=${split.val}${projectParam}`;
}

export function getCocoExportUrl(): string {
  return '/api/export/coco';
}
