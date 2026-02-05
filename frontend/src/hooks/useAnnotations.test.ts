import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useAnnotations } from '@/hooks/useAnnotations';
import { mockAnnotations } from '@/test/mocks/handlers';

describe('useAnnotations', () => {
  describe('initial state', () => {
    it('should start with empty state', () => {
      const { result } = renderHook(() => useAnnotations());

      expect(result.current.annotations).toEqual([]);
      expect(result.current.selectedId).toBeNull();
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  describe('loadAnnotations', () => {
    it('should load annotations for an image', async () => {
      const { result } = renderHook(() => useAnnotations());

      await act(async () => {
        await result.current.loadAnnotations('image1.png');
      });

      await waitFor(() => {
        expect(result.current.annotations).toHaveLength(mockAnnotations.length);
      });
      expect(result.current.annotations[0]?.label).toBe('product');
      expect(result.current.selectedId).toBeNull();
      expect(result.current.error).toBeNull();
    });

    it('should set loading to false after fetch completes', async () => {
      const { result } = renderHook(() => useAnnotations());

      await act(async () => {
        await result.current.loadAnnotations('image1.png');
      });

      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  describe('addAnnotation', () => {
    it('should add a new annotation', async () => {
      const { result } = renderHook(() => useAnnotations());

      await act(async () => {
        await result.current.addAnnotation(
          'image1.png',
          'new-label',
          2,
          { x: 100, y: 100, width: 200, height: 150 },
          1000,
          750
        );
      });

      await waitFor(() => {
        expect(result.current.annotations).toHaveLength(1);
      });

      const annotation = result.current.annotations[0];
      expect(annotation?.label).toBe('new-label');
      expect(annotation?.class_id).toBe(2);
      // Should convert pixel coords to normalized
      expect(annotation?.bbox.x).toBeCloseTo(0.2); // (100 + 200/2) / 1000
      expect(annotation?.bbox.y).toBeCloseTo(0.233); // (100 + 150/2) / 750
    });

    it('should select the newly added annotation', async () => {
      const { result } = renderHook(() => useAnnotations());

      await act(async () => {
        await result.current.addAnnotation(
          'image1.png',
          'test',
          0,
          { x: 50, y: 50, width: 100, height: 100 },
          500,
          500
        );
      });

      await waitFor(() => {
        expect(result.current.selectedId).not.toBeNull();
      });
    });
  });

  describe('updateAnnotation', () => {
    it('should update an existing annotation', async () => {
      const { result } = renderHook(() => useAnnotations());

      // First load annotations
      await act(async () => {
        await result.current.loadAnnotations('image1.png');
      });

      await waitFor(() => {
        expect(result.current.annotations).toHaveLength(2);
      });

      // Then update one
      await act(async () => {
        await result.current.updateAnnotation('image1.png', 'ann-1', {
          label: 'updated-label',
        });
      });

      await waitFor(() => {
        const updated = result.current.annotations.find((a) => a.id === 'ann-1');
        expect(updated?.label).toBe('updated-label');
      });
    });
  });

  describe('deleteAnnotation', () => {
    it('should remove an annotation from the list', async () => {
      const { result } = renderHook(() => useAnnotations());

      await act(async () => {
        await result.current.loadAnnotations('image1.png');
      });

      await waitFor(() => {
        expect(result.current.annotations).toHaveLength(2);
      });

      await act(async () => {
        await result.current.deleteAnnotation('image1.png', 'ann-1');
      });

      await waitFor(() => {
        expect(result.current.annotations).toHaveLength(1);
        expect(result.current.annotations.find((a) => a.id === 'ann-1')).toBeUndefined();
      });
    });

    it('should clear selection if deleted annotation was selected', async () => {
      const { result } = renderHook(() => useAnnotations());

      await act(async () => {
        await result.current.loadAnnotations('image1.png');
      });

      // Select the first annotation
      act(() => {
        result.current.selectAnnotation('ann-1');
      });
      expect(result.current.selectedId).toBe('ann-1');

      // Delete it
      await act(async () => {
        await result.current.deleteAnnotation('image1.png', 'ann-1');
      });

      expect(result.current.selectedId).toBeNull();
    });
  });

  describe('clearAnnotations', () => {
    it('should clear all annotations', async () => {
      const { result } = renderHook(() => useAnnotations());

      await act(async () => {
        await result.current.loadAnnotations('image1.png');
      });

      await waitFor(() => {
        expect(result.current.annotations.length).toBeGreaterThan(0);
      });

      await act(async () => {
        await result.current.clearAnnotations('image1.png');
      });

      expect(result.current.annotations).toEqual([]);
      expect(result.current.selectedId).toBeNull();
    });
  });

  describe('selectAnnotation', () => {
    it('should update selected annotation id', () => {
      const { result } = renderHook(() => useAnnotations());

      act(() => {
        result.current.selectAnnotation('some-id');
      });

      expect(result.current.selectedId).toBe('some-id');
    });

    it('should clear selection when passed null', () => {
      const { result } = renderHook(() => useAnnotations());

      act(() => {
        result.current.selectAnnotation('some-id');
      });
      expect(result.current.selectedId).toBe('some-id');

      act(() => {
        result.current.selectAnnotation(null);
      });
      expect(result.current.selectedId).toBeNull();
    });
  });

  describe('updateLocalBbox', () => {
    it('should update bbox locally without API call', async () => {
      const { result } = renderHook(() => useAnnotations());

      await act(async () => {
        await result.current.loadAnnotations('image1.png');
      });

      const newBbox = { x: 0.6, y: 0.6, width: 0.3, height: 0.3 };

      act(() => {
        result.current.updateLocalBbox('ann-1', newBbox);
      });

      const updated = result.current.annotations.find((a) => a.id === 'ann-1');
      expect(updated?.bbox).toEqual(newBbox);
    });
  });
});
