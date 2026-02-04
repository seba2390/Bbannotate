import { useState, useCallback } from 'react';
import type {
  Annotation,
  AnnotationCreate,
  AnnotationUpdate,
  BoundingBox,
  DrawingRect,
} from '@/types';
import * as api from '@/lib/api';

interface UseAnnotationsResult {
  annotations: Annotation[];
  selectedId: string | null;
  loading: boolean;
  error: string | null;
  loadAnnotations: (filename: string) => Promise<void>;
  addAnnotation: (
    filename: string,
    label: string,
    classId: number,
    rect: DrawingRect,
    imageWidth: number,
    imageHeight: number
  ) => Promise<void>;
  updateAnnotation: (
    filename: string,
    annotationId: string,
    update: AnnotationUpdate
  ) => Promise<void>;
  deleteAnnotation: (filename: string, annotationId: string) => Promise<void>;
  clearAnnotations: (filename: string) => Promise<void>;
  selectAnnotation: (id: string | null) => void;
  updateLocalBbox: (annotationId: string, bbox: BoundingBox) => void;
}

/**
 * Hook for managing annotations state and API operations.
 */
export function useAnnotations(): UseAnnotationsResult {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAnnotations = useCallback(async (filename: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getAnnotations(filename);
      setAnnotations(data);
      setSelectedId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load annotations');
      setAnnotations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const addAnnotation = useCallback(
    async (
      filename: string,
      label: string,
      classId: number,
      rect: DrawingRect,
      imageWidth: number,
      imageHeight: number
    ) => {
      // Convert pixel coordinates to normalized YOLO format (center x, center y, width, height)
      const bbox: BoundingBox = {
        x: (rect.x + rect.width / 2) / imageWidth,
        y: (rect.y + rect.height / 2) / imageHeight,
        width: Math.abs(rect.width) / imageWidth,
        height: Math.abs(rect.height) / imageHeight,
      };

      const create: AnnotationCreate = {
        label,
        class_id: classId,
        bbox,
      };

      try {
        const newAnnotation = await api.addAnnotation(filename, create);
        setAnnotations((prev) => [...prev, newAnnotation]);
        setSelectedId(newAnnotation.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add annotation');
      }
    },
    []
  );

  const updateAnnotation = useCallback(
    async (filename: string, annotationId: string, update: AnnotationUpdate) => {
      try {
        const updated = await api.updateAnnotation(filename, annotationId, update);
        setAnnotations((prev) => prev.map((a) => (a.id === annotationId ? updated : a)));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update annotation');
      }
    },
    []
  );

  const deleteAnnotation = useCallback(async (filename: string, annotationId: string) => {
    try {
      await api.deleteAnnotation(filename, annotationId);
      setAnnotations((prev) => prev.filter((a) => a.id !== annotationId));
      setSelectedId((prev) => (prev === annotationId ? null : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete annotation');
    }
  }, []);

  const clearAnnotations = useCallback(async (filename: string) => {
    try {
      await api.clearAnnotations(filename);
      setAnnotations([]);
      setSelectedId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear annotations');
    }
  }, []);

  const selectAnnotation = useCallback((id: string | null) => {
    setSelectedId(id);
  }, []);

  const updateLocalBbox = useCallback((annotationId: string, bbox: BoundingBox) => {
    setAnnotations((prev) => prev.map((a) => (a.id === annotationId ? { ...a, bbox } : a)));
  }, []);

  return {
    annotations,
    selectedId,
    loading,
    error,
    loadAnnotations,
    addAnnotation,
    updateAnnotation,
    deleteAnnotation,
    clearAnnotations,
    selectAnnotation,
    updateLocalBbox,
  };
}
