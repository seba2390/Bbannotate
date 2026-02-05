import { describe, it, expect } from 'vitest';
import * as api from '@/lib/api';
import { mockProjects, mockImages, mockAnnotations, mockProjectInfo } from '@/test/mocks/handlers';

describe('API Client', () => {
  describe('Project Management', () => {
    it('should list all projects', async () => {
      const projects = await api.listProjects();
      expect(projects).toHaveLength(mockProjects.length);
      expect(projects[0]).toMatchObject({
        id: 'project-1',
        name: 'Test Project',
      });
    });

    it('should create a new project', async () => {
      const newProject = await api.createProject({ name: 'New Project' });
      expect(newProject.name).toBe('New Project');
      expect(newProject.id).toBeDefined();
      expect(newProject.image_count).toBe(0);
    });

    it('should get current project (null when none open)', async () => {
      const current = await api.getCurrentProject();
      expect(current).toBeNull();
    });

    it('should open a project', async () => {
      const project = await api.openProject('project-1');
      expect(project.id).toBe('project-1');
      expect(project.name).toBe('Test Project');
    });

    it('should close project', async () => {
      await expect(api.closeProject()).resolves.not.toThrow();
    });

    it('should delete a project', async () => {
      await expect(api.deleteProject('project-1')).resolves.not.toThrow();
    });
  });

  describe('Project Info', () => {
    it('should get project info', async () => {
      const info = await api.getProjectInfo();
      expect(info).toMatchObject(mockProjectInfo);
      expect(info.labels).toContain('product');
    });
  });

  describe('Image Management', () => {
    it('should list images', async () => {
      const images = await api.listImages();
      expect(images).toEqual(mockImages);
    });

    it('should upload an image', async () => {
      const file = new File(['test'], 'test.png', { type: 'image/png' });
      const result = await api.uploadImage(file);
      expect(result.filename).toBeDefined();
      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
    });

    it('should upload multiple images', async () => {
      const files = [
        new File(['test1'], 'test1.png', { type: 'image/png' }),
        new File(['test2'], 'test2.png', { type: 'image/png' }),
      ];
      const results = await api.uploadImages(files);
      expect(results).toHaveLength(2);
      expect(results[0]?.filename).toBeDefined();
      expect(results[1]?.filename).toBeDefined();
    });

    it('should generate correct image URL without project', () => {
      // Ensure no project is set
      api.setCurrentProjectId(null);
      const url = api.getImageUrl('test image.png');
      expect(url).toBe('/api/images/test%20image.png');
    });

    it('should include project_id in image URL when project is set', () => {
      api.setCurrentProjectId('my-project');
      const url = api.getImageUrl('test image.png');
      expect(url).toBe('/api/images/test%20image.png?project_id=my-project');
      // Clean up
      api.setCurrentProjectId(null);
    });

    it('should delete an image', async () => {
      await expect(api.deleteImage('image1.png')).resolves.not.toThrow();
    });
  });

  describe('Annotation Management', () => {
    it('should get annotations for an image', async () => {
      const annotations = await api.getAnnotations('image1.png');
      expect(annotations).toHaveLength(mockAnnotations.length);
      expect(annotations[0]).toMatchObject({
        id: 'ann-1',
        label: 'product',
      });
    });

    it('should add an annotation', async () => {
      const create = {
        label: 'test',
        class_id: 0,
        bbox: { x: 0.5, y: 0.5, width: 0.2, height: 0.2 },
      };
      const annotation = await api.addAnnotation('image1.png', create);
      expect(annotation.id).toBeDefined();
      expect(annotation.label).toBe('test');
      expect(annotation.bbox).toEqual(create.bbox);
    });

    it('should update an annotation', async () => {
      const update = { label: 'updated' };
      const updated = await api.updateAnnotation('image1.png', 'ann-1', update);
      expect(updated.label).toBe('updated');
    });

    it('should delete an annotation', async () => {
      await expect(api.deleteAnnotation('image1.png', 'ann-1')).resolves.not.toThrow();
    });

    it('should clear all annotations', async () => {
      const count = await api.clearAnnotations('image1.png');
      expect(count).toBe(mockAnnotations.length);
    });

    it('should copy annotations from another image', async () => {
      const count = await api.copyAnnotations('image2.png', 'image1.png');
      expect(count).toBe(mockAnnotations.length);
    });
  });

  describe('Export', () => {
    it('should generate correct YOLO export URL', () => {
      api.setCurrentProjectId(null);
      const url = api.getExportUrl('yolo');
      expect(url).toBe('/api/export/yolo?train_split=0.7&val_split=0.2&test_split=0.1');
    });

    it('should generate correct YOLO export URL with custom split', () => {
      api.setCurrentProjectId(null);
      const url = api.getExportUrl('yolo', { train: 0.8, val: 0.1, test: 0.1 });
      expect(url).toBe('/api/export/yolo?train_split=0.8&val_split=0.1&test_split=0.1');
    });

    it('should generate correct COCO export URL', () => {
      api.setCurrentProjectId(null);
      expect(api.getExportUrl('coco')).toBe('/api/export/coco');
    });

    it('should generate correct Pascal VOC export URL', () => {
      api.setCurrentProjectId(null);
      expect(api.getExportUrl('pascal-voc')).toBe('/api/export/pascal-voc');
    });

    it('should generate correct CreateML export URL', () => {
      api.setCurrentProjectId(null);
      expect(api.getExportUrl('createml')).toBe('/api/export/createml');
    });

    it('should generate correct CSV export URL', () => {
      api.setCurrentProjectId(null);
      expect(api.getExportUrl('csv')).toBe('/api/export/csv');
    });

    it('should include project_id in YOLO export URL when project is set', () => {
      api.setCurrentProjectId('my-project');
      const url = api.getExportUrl('yolo');
      expect(url).toBe(
        '/api/export/yolo?train_split=0.7&val_split=0.2&test_split=0.1&project_id=my-project'
      );
      api.setCurrentProjectId(null);
    });

    it('should include project_id in COCO export URL when project is set', () => {
      api.setCurrentProjectId('my-project');
      const url = api.getExportUrl('coco');
      expect(url).toBe('/api/export/coco?project_id=my-project');
      api.setCurrentProjectId(null);
    });

    it('should include project_id in Pascal VOC export URL when project is set', () => {
      api.setCurrentProjectId('my-project');
      const url = api.getExportUrl('pascal-voc');
      expect(url).toBe('/api/export/pascal-voc?project_id=my-project');
      api.setCurrentProjectId(null);
    });

    it('should include project_id in CreateML export URL when project is set', () => {
      api.setCurrentProjectId('my-project');
      const url = api.getExportUrl('createml');
      expect(url).toBe('/api/export/createml?project_id=my-project');
      api.setCurrentProjectId(null);
    });

    it('should include project_id in CSV export URL when project is set', () => {
      api.setCurrentProjectId('my-project');
      const url = api.getExportUrl('csv');
      expect(url).toBe('/api/export/csv?project_id=my-project');
      api.setCurrentProjectId(null);
    });

    it('should URL-encode project_id with special characters', () => {
      api.setCurrentProjectId('my project/test');
      const url = api.getExportUrl('yolo');
      expect(url).toContain('project_id=my%20project%2Ftest');
      api.setCurrentProjectId(null);
    });

    it('should have all export formats defined', () => {
      expect(api.EXPORT_FORMATS).toHaveLength(5);
      expect(api.EXPORT_FORMATS.map((f) => f.id)).toEqual([
        'yolo',
        'coco',
        'pascal-voc',
        'createml',
        'csv',
      ]);
    });
  });
});
