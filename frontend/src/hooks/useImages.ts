import { useState, useCallback } from 'react';
import * as api from '@/lib/api';

interface UseImagesResult {
  images: string[];
  currentImage: string | null;
  currentIndex: number;
  loading: boolean;
  error: string | null;
  loadImages: () => Promise<void>;
  refreshImages: () => Promise<void>;
  selectImage: (filename: string) => void;
  nextImage: () => void;
  prevImage: () => void;
  uploadImages: (files: File[]) => Promise<void>;
  deleteImage: (filename: string) => Promise<void>;
}

/**
 * Hook for managing image list and navigation.
 */
export function useImages(): UseImagesResult {
  const [images, setImages] = useState<string[]>([]);
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentIndex = currentImage ? images.indexOf(currentImage) : -1;

  const loadImages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listImages();
      setImages(data);
      if (data.length > 0 && !currentImage) {
        setCurrentImage(data[0] ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load images');
    } finally {
      setLoading(false);
    }
  }, [currentImage]);

  // Refresh images (reset current selection too)
  const refreshImages = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCurrentImage(null);
    try {
      const data = await api.listImages();
      setImages(data);
      if (data.length > 0) {
        setCurrentImage(data[0] ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load images');
    } finally {
      setLoading(false);
    }
  }, []);

  const selectImage = useCallback((filename: string) => {
    setCurrentImage(filename);
  }, []);

  const nextImage = useCallback(() => {
    if (images.length === 0) return;
    const nextIndex = (currentIndex + 1) % images.length;
    const next = images[nextIndex];
    if (next) {
      setCurrentImage(next);
    }
  }, [images, currentIndex]);

  const prevImage = useCallback(() => {
    if (images.length === 0) return;
    const prevIndex = (currentIndex - 1 + images.length) % images.length;
    const prev = images[prevIndex];
    if (prev) {
      setCurrentImage(prev);
    }
  }, [images, currentIndex]);

  const uploadImages = useCallback(async (files: File[]) => {
    setLoading(true);
    setError(null);
    try {
      const uploaded = await api.uploadImages(files);
      const newFilenames = uploaded.map((i) => i.filename);
      setImages((prev) => [...prev, ...newFilenames]);
      if (newFilenames.length > 0) {
        setCurrentImage(newFilenames[0] ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload images');
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteImage = useCallback(
    async (filename: string) => {
      try {
        await api.deleteImage(filename);
        setImages((prev) => {
          const newImages = prev.filter((i) => i !== filename);
          if (currentImage === filename) {
            const newCurrentIndex = Math.min(currentIndex, newImages.length - 1);
            setCurrentImage(newImages[newCurrentIndex] ?? null);
          }
          return newImages;
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete image');
      }
    },
    [currentImage, currentIndex]
  );

  // Note: Don't auto-load on mount - let App call refreshImages when project opens

  return {
    images,
    currentImage,
    currentIndex,
    loading,
    error,
    loadImages,
    refreshImages,
    selectImage,
    nextImage,
    prevImage,
    uploadImages,
    deleteImage,
  };
}
