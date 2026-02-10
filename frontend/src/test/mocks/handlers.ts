import { http, HttpResponse } from 'msw';
import type {
  Annotation,
  AnnotationCreate,
  ImageInfo,
  Project,
  ProjectCreate,
  ProjectRename,
} from '@/types';

// Mock data
export const mockProjects: Project[] = [
  {
    id: 'project-1',
    name: 'Test Project',
    created_at: '2024-01-01T00:00:00Z',
    last_opened: '2024-01-15T00:00:00Z',
    image_count: 5,
    annotation_count: 10,
  },
  {
    id: 'project-2',
    name: 'Another Project',
    created_at: '2024-01-10T00:00:00Z',
    last_opened: '2024-01-20T00:00:00Z',
    image_count: 3,
    annotation_count: 7,
  },
];

export const mockImages: string[] = ['image1.png', 'image2.jpg', 'image3.png'];

export const mockAnnotations: Annotation[] = [
  {
    id: 'ann-1',
    label: 'product',
    class_id: 0,
    bbox: { x: 0.5, y: 0.5, width: 0.2, height: 0.3 },
  },
  {
    id: 'ann-2',
    label: 'price',
    class_id: 1,
    bbox: { x: 0.3, y: 0.4, width: 0.1, height: 0.15 },
  },
];

export const mockProjectInfo = {
  name: 'Test Project',
  labels: ['product', 'price', 'discount'],
  image_count: 5,
  annotation_count: 10,
  annotated_image_count: 4,
  done_image_count: 3,
};

let currentProjectId: string | null = null;

export const handlers = [
  // Browser session lifecycle endpoints
  http.post('/api/session/heartbeat', () => {
    return HttpResponse.json({ ok: true });
  }),

  http.post('/api/session/close', () => {
    return HttpResponse.json({ ok: true });
  }),

  // Project endpoints
  http.get('/api/projects', () => {
    return HttpResponse.json(mockProjects);
  }),

  http.post('/api/projects', async ({ request }) => {
    const body = (await request.json()) as ProjectCreate;
    const newProject: Project = {
      id: `project-${Date.now()}`,
      name: body.name,
      created_at: new Date().toISOString(),
      last_opened: new Date().toISOString(),
      image_count: 0,
      annotation_count: 0,
    };
    return HttpResponse.json(newProject, { status: 201 });
  }),

  http.get('/api/projects/current', () => {
    if (!currentProjectId) {
      return HttpResponse.json(null);
    }
    const project = mockProjects.find((p) => p.id === currentProjectId);
    return HttpResponse.json(project ?? null);
  }),

  http.post('/api/projects/:projectId/open', ({ params }) => {
    const { projectId } = params;
    currentProjectId = projectId as string;
    const project = mockProjects.find((p) => p.id === projectId);
    if (!project) {
      return HttpResponse.json({ detail: 'Project not found' }, { status: 404 });
    }
    return HttpResponse.json(project);
  }),

  http.patch('/api/projects/:projectId', async ({ params, request }) => {
    const { projectId } = params;
    const body = (await request.json()) as ProjectRename;
    const project = mockProjects.find((p) => p.id === projectId);
    if (!project) {
      return HttpResponse.json({ detail: 'Project not found' }, { status: 404 });
    }
    return HttpResponse.json({
      ...project,
      name: body.name,
    });
  }),

  http.post('/api/projects/close', () => {
    currentProjectId = null;
    return new HttpResponse(null, { status: 204 });
  }),

  http.delete('/api/projects/:projectId', () => {
    return new HttpResponse(null, { status: 204 });
  }),

  // Project info
  http.get('/api/project', () => {
    return HttpResponse.json(mockProjectInfo);
  }),

  // Image endpoints
  http.get('/api/images', () => {
    return HttpResponse.json(mockImages);
  }),

  http.post('/api/images', async ({ request }) => {
    try {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      const imageInfo: ImageInfo = {
        filename: file?.name ?? 'uploaded.png',
        width: 800,
        height: 600,
      };
      return HttpResponse.json(imageInfo, { status: 201 });
    } catch {
      // Fallback if formData parsing fails
      return HttpResponse.json(
        { filename: 'uploaded.png', width: 800, height: 600 },
        { status: 201 }
      );
    }
  }),

  http.get('/api/images/:filename', ({ params }) => {
    const { filename } = params;
    // Return a simple 1x1 PNG for image requests
    const png = new Uint8Array([
      137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0,
      0, 0, 31, 21, 196, 137, 0, 0, 0, 10, 73, 68, 65, 84, 120, 156, 99, 0, 1, 0, 0, 5, 0, 1, 13,
      10, 45, 180, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
    ]);
    return new HttpResponse(png, {
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `inline; filename="${filename}"`,
      },
    });
  }),

  http.delete('/api/images/:filename', () => {
    return new HttpResponse(null, { status: 204 });
  }),

  // Annotation endpoints
  http.get('/api/images/:filename/annotations', () => {
    return HttpResponse.json(mockAnnotations);
  }),

  http.post('/api/images/:filename/annotations', async ({ request }) => {
    const body = (await request.json()) as AnnotationCreate;
    const newAnnotation: Annotation = {
      id: `ann-${Date.now()}`,
      ...body,
    };
    return HttpResponse.json(newAnnotation, { status: 201 });
  }),

  http.put('/api/images/:filename/annotations/:annotationId', async ({ params, request }) => {
    const { annotationId } = params;
    const body = (await request.json()) as Partial<Annotation>;
    const existing = mockAnnotations.find((a) => a.id === annotationId);
    if (!existing) {
      return HttpResponse.json({ detail: 'Annotation not found' }, { status: 404 });
    }
    const updated: Annotation = { ...existing, ...body };
    return HttpResponse.json(updated);
  }),

  http.delete('/api/images/:filename/annotations/:annotationId', () => {
    return new HttpResponse(null, { status: 204 });
  }),

  http.delete('/api/images/:filename/annotations', () => {
    return HttpResponse.json({ deleted: mockAnnotations.length });
  }),

  http.post('/api/images/:targetFilename/annotations/copy-from/:sourceFilename', () => {
    return HttpResponse.json({ copied: mockAnnotations.length });
  }),

  // Export endpoints
  http.get('/api/export/yolo', () => {
    return new HttpResponse(new Uint8Array([80, 75, 3, 4]), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="yolo_export.zip"',
      },
    });
  }),

  http.get('/api/export/coco', () => {
    return HttpResponse.json({
      info: { description: 'COCO Export' },
      images: [],
      annotations: [],
      categories: [],
    });
  }),

  http.get('/api/export/pascal-voc', () => {
    return new HttpResponse(new Uint8Array([80, 75, 3, 4]), {
      headers: {
        'Content-Type': 'application/zip',
      },
    });
  }),

  http.get('/api/export/createml', () => {
    return HttpResponse.json([]);
  }),

  http.get('/api/export/csv', () => {
    return new HttpResponse('filename,class_id,label,x,y,width,height\n', {
      headers: {
        'Content-Type': 'text/csv',
      },
    });
  }),
];
