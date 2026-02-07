import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useImages } from '@/hooks/useImages';
import { mockImages } from '@/test/mocks/handlers';

describe('useImages', () => {
  describe('initial state', () => {
    it('should start with empty state', () => {
      const { result } = renderHook(() => useImages());

      expect(result.current.images).toEqual([]);
      expect(result.current.currentImage).toBeNull();
      expect(result.current.currentIndex).toBe(-1);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  describe('loadImages', () => {
    it('should load images and select first', async () => {
      const { result } = renderHook(() => useImages());

      await act(async () => {
        await result.current.loadImages();
      });

      await waitFor(() => {
        expect(result.current.images).toEqual(mockImages);
      });
      expect(result.current.currentImage).toBe(mockImages[0]);
      expect(result.current.currentIndex).toBe(0);
    });

    it('should set loading to false after fetch completes', async () => {
      const { result } = renderHook(() => useImages());

      await act(async () => {
        await result.current.loadImages();
      });

      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  describe('refreshImages', () => {
    it('should reset and reload images', async () => {
      const { result } = renderHook(() => useImages());

      // First load
      await act(async () => {
        await result.current.loadImages();
      });

      // Select a different image
      act(() => {
        result.current.selectImage(mockImages[1]!);
      });
      expect(result.current.currentImage).toBe(mockImages[1]);

      // Refresh should reset to first image
      await act(async () => {
        await result.current.refreshImages();
      });

      expect(result.current.currentImage).toBe(mockImages[0]);
    });
  });

  describe('selectImage', () => {
    it('should select specified image', async () => {
      const { result } = renderHook(() => useImages());

      await act(async () => {
        await result.current.loadImages();
      });

      act(() => {
        result.current.selectImage(mockImages[2]!);
      });

      expect(result.current.currentImage).toBe(mockImages[2]);
      expect(result.current.currentIndex).toBe(2);
    });
  });

  describe('navigation', () => {
    it('should navigate to next image', async () => {
      const { result } = renderHook(() => useImages());

      await act(async () => {
        await result.current.loadImages();
      });

      act(() => {
        result.current.nextImage();
      });

      expect(result.current.currentImage).toBe(mockImages[1]);
      expect(result.current.currentIndex).toBe(1);
    });

    it('should wrap around when reaching end', async () => {
      const { result } = renderHook(() => useImages());

      await act(async () => {
        await result.current.loadImages();
      });

      // Select last image
      act(() => {
        result.current.selectImage(mockImages[mockImages.length - 1]!);
      });

      // Next should wrap to first
      act(() => {
        result.current.nextImage();
      });

      expect(result.current.currentImage).toBe(mockImages[0]);
    });

    it('should navigate to previous image', async () => {
      const { result } = renderHook(() => useImages());

      await act(async () => {
        await result.current.loadImages();
      });

      act(() => {
        result.current.selectImage(mockImages[1]!);
      });

      act(() => {
        result.current.prevImage();
      });

      expect(result.current.currentImage).toBe(mockImages[0]);
    });

    it('should wrap around when at beginning', async () => {
      const { result } = renderHook(() => useImages());

      await act(async () => {
        await result.current.loadImages();
      });

      // At first image, go prev should wrap to last
      act(() => {
        result.current.prevImage();
      });

      expect(result.current.currentImage).toBe(mockImages[mockImages.length - 1]);
    });

    it('should do nothing when no images', () => {
      const { result } = renderHook(() => useImages());

      act(() => {
        result.current.nextImage();
      });

      expect(result.current.currentImage).toBeNull();

      act(() => {
        result.current.prevImage();
      });

      expect(result.current.currentImage).toBeNull();
    });
  });

  describe('uploadImages', () => {
    it('should upload and add new images', async () => {
      const { result } = renderHook(() => useImages());

      const files = [
        new File(['content1'], 'new1.png', { type: 'image/png' }),
        new File(['content2'], 'new2.png', { type: 'image/png' }),
      ];

      await act(async () => {
        await result.current.uploadImages(files);
      });

      await waitFor(() => {
        expect(result.current.images.length).toBeGreaterThan(0);
      });
      // Should select an uploaded image
      expect(result.current.currentImage).toBeDefined();
    });

    it('should set loading to false after upload completes', async () => {
      const { result } = renderHook(() => useImages());

      const file = new File(['test'], 'test.png', { type: 'image/png' });

      await act(async () => {
        await result.current.uploadImages([file]);
      });

      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  describe('deleteImage', () => {
    it('should remove image from list', async () => {
      const { result } = renderHook(() => useImages());

      await act(async () => {
        await result.current.loadImages();
      });

      const initialCount = result.current.images.length;

      await act(async () => {
        await result.current.deleteImage(mockImages[1]!);
      });

      expect(result.current.images.length).toBe(initialCount - 1);
      expect(result.current.images).not.toContain(mockImages[1]);
    });

    it('should select next image if current is deleted', async () => {
      const { result } = renderHook(() => useImages());

      await act(async () => {
        await result.current.loadImages();
      });

      expect(result.current.currentImage).toBe(mockImages[0]);

      await act(async () => {
        await result.current.deleteImage(mockImages[0]!);
      });

      // Should move to next available image
      expect(result.current.currentImage).toBe(mockImages[1]);
    });

    it('should handle deleting last remaining image', async () => {
      const { result } = renderHook(() => useImages());

      await act(async () => {
        await result.current.loadImages();
      });

      // Delete all images
      for (const image of [...mockImages]) {
        await act(async () => {
          await result.current.deleteImage(image);
        });
      }

      expect(result.current.images).toEqual([]);
      expect(result.current.currentImage).toBeNull();
    });
  });

  describe('deleteImages (bulk delete)', () => {
    it('should remove multiple images from list', async () => {
      const { result } = renderHook(() => useImages());

      await act(async () => {
        await result.current.loadImages();
      });

      const initialCount = result.current.images.length;
      const imagesToDelete = [mockImages[0]!, mockImages[2]!];

      await act(async () => {
        await result.current.deleteImages(imagesToDelete);
      });

      expect(result.current.images.length).toBe(initialCount - 2);
      expect(result.current.images).not.toContain(mockImages[0]);
      expect(result.current.images).not.toContain(mockImages[2]);
      expect(result.current.images).toContain(mockImages[1]);
    });

    it('should select next image if current is among deleted', async () => {
      const { result } = renderHook(() => useImages());

      await act(async () => {
        await result.current.loadImages();
      });

      expect(result.current.currentImage).toBe(mockImages[0]);

      await act(async () => {
        await result.current.deleteImages([mockImages[0]!]);
      });

      // Should move to next available image
      expect(result.current.currentImage).toBe(mockImages[1]);
    });

    it('should handle deleting all images', async () => {
      const { result } = renderHook(() => useImages());

      await act(async () => {
        await result.current.loadImages();
      });

      await act(async () => {
        await result.current.deleteImages([...mockImages]);
      });

      expect(result.current.images).toEqual([]);
      expect(result.current.currentImage).toBeNull();
    });

    it('should handle empty array', async () => {
      const { result } = renderHook(() => useImages());

      await act(async () => {
        await result.current.loadImages();
      });

      const initialCount = result.current.images.length;

      await act(async () => {
        await result.current.deleteImages([]);
      });

      expect(result.current.images.length).toBe(initialCount);
    });
  });
});
