import { useState, useCallback } from 'react';
import type {
  Annotation,
  AnnotationCreate,
  AnnotationUpdate,
  BoundingBox,
  DrawingRect,
} from '@/types';
import * as api from '@/lib/api';

/** Represents an annotation that can be undone */
interface UndoableAnnotation {
  filename: string;
  annotationId: string;
}

interface UseAnnotationsResult {
  annotations: Annotation[];
  selectedId: string | null;
  loading: boolean;
  error: string | null;
  canUndo: boolean;
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
  undoLastAnnotation: () => Promise<void>;
}

/**
 * Hook for managing annotations state and API operations.
 */
export function useAnnotations(): UseAnnotationsResult {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<UndoableAnnotation[]>([]);

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
        // Add to undo stack
        setUndoStack((prev) => [...prev, { filename, annotationId: newAnnotation.id }]);
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
      // Remove from undo stack if present
      setUndoStack((prev) => prev.filter((u) => u.annotationId !== annotationId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete annotation');
    }
  }, []);

  const clearAnnotations = useCallback(async (filename: string) => {
    try {
      await api.clearAnnotations(filename);
      setAnnotations([]);
      setSelectedId(null);
      // Clear undo stack for this file
      setUndoStack((prev) => prev.filter((u) => u.filename !== filename));
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

  const undoLastAnnotation = useCallback(async () => {
    if (undoStack.length === 0) return;

    const lastAction = undoStack[undoStack.length - 1];
    if (!lastAction) return;

    try {
      await api.deleteAnnotation(lastAction.filename, lastAction.annotationId);
      setAnnotations((prev) => prev.filter((a) => a.id !== lastAction.annotationId));
      setSelectedId((prev) => (prev === lastAction.annotationId ? null : prev));
      setUndoStack((prev) => prev.slice(0, -1));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to undo annotation');
    }
  }, [undoStack]);

  return {
    annotations,
    selectedId,
    loading,
    error,
    canUndo: undoStack.length > 0,
    loadAnnotations,
    addAnnotation,
    updateAnnotation,
    deleteAnnotation,
    clearAnnotations,
    selectAnnotation,
    updateLocalBbox,
    undoLastAnnotation,
  };
}
