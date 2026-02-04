import { useState, useEffect, useCallback } from 'react';
import {
  AnnotationCanvas,
  ImageUpload,
  ImageList,
  AnnotationList,
  Toolbar,
  ProjectManager,
} from '@/components';
import { useAnnotations, useImages } from '@/hooks';
import { getImageUrl, getYoloExportUrl, getProjectInfo, closeProject } from '@/lib/api';
import type { ToolMode, DrawingRect, BoundingBox, Project } from '@/types';

/** Default labels for grocery flyer annotation */
const DEFAULT_LABELS = ['product', 'price', 'brand', 'promo'];

/**
 * Main application component for bounding box annotation.
 */
function App(): JSX.Element {
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [toolMode, setToolMode] = useState<ToolMode>('draw');
  const [currentLabel, setCurrentLabel] = useState(DEFAULT_LABELS[0] ?? 'product');
  const [labels] = useState(DEFAULT_LABELS);
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return (
        localStorage.getItem('darkMode') === 'true' ||
        (!localStorage.getItem('darkMode') &&
          window.matchMedia('(prefers-color-scheme: dark)').matches)
      );
    }
    return false;
  });
  const [annotatedCount, setAnnotatedCount] = useState(0);

  const {
    images,
    currentImage,
    currentIndex,
    loading: imagesLoading,
    uploadImages,
    selectImage,
    nextImage,
    prevImage,
    deleteImage,
    refreshImages,
  } = useImages();

  const {
    annotations,
    selectedId,
    loading: annotationsLoading,
    loadAnnotations,
    addAnnotation,
    updateAnnotation,
    deleteAnnotation,
    clearAnnotations,
    selectAnnotation,
    updateLocalBbox,
  } = useAnnotations();

  // Handle project open
  const handleOpenProject = useCallback(
    (project: Project): void => {
      setCurrentProject(project);
      // Refresh images when project opens
      refreshImages();
    },
    [refreshImages]
  );

  // Handle closing project
  const handleCloseProject = useCallback(async (): Promise<void> => {
    await closeProject();
    setCurrentProject(null);
  }, []);

  // Load annotations when image changes
  useEffect(() => {
    if (currentImage) {
      loadAnnotations(currentImage);
    }
  }, [currentImage, loadAnnotations]);

  // Toggle dark mode
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('darkMode', 'true');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('darkMode', 'false');
    }
  }, [darkMode]);

  // Load project info for progress tracking
  useEffect(() => {
    const loadProgress = async (): Promise<void> => {
      try {
        const info = await getProjectInfo();
        setAnnotatedCount(info.annotated_image_count);
      } catch {
        // Ignore errors
      }
    };
    loadProgress();
  }, [images, annotations]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      // Ignore if typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) {
        return;
      }

      switch (e.key) {
        case 'v':
        case 'V':
          setToolMode('select');
          break;
        case 'd':
        case 'D':
          setToolMode('draw');
          break;
        case 'ArrowLeft':
          prevImage();
          break;
        case 'ArrowRight':
          nextImage();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [prevImage, nextImage]);

  const handleAddAnnotation = useCallback(
    (rect: DrawingRect, imageWidth: number, imageHeight: number) => {
      if (!currentImage) return;
      const classId = labels.indexOf(currentLabel);
      addAnnotation(
        currentImage,
        currentLabel,
        classId >= 0 ? classId : 0,
        rect,
        imageWidth,
        imageHeight
      );
    },
    [currentImage, currentLabel, labels, addAnnotation]
  );

  const handleUpdateBbox = useCallback(
    (annotationId: string, bbox: BoundingBox) => {
      if (!currentImage) return;
      // Update local state immediately for responsive UI
      updateLocalBbox(annotationId, bbox);
      // Sync with server
      updateAnnotation(currentImage, annotationId, { bbox });
    },
    [currentImage, updateLocalBbox, updateAnnotation]
  );

  const handleDeleteAnnotation = useCallback(
    (annotationId: string) => {
      if (!currentImage) return;
      deleteAnnotation(currentImage, annotationId);
    },
    [currentImage, deleteAnnotation]
  );

  const handleClearAnnotations = useCallback(() => {
    if (!currentImage) return;
    if (confirm('Clear all annotations for this image?')) {
      clearAnnotations(currentImage);
    }
  }, [currentImage, clearAnnotations]);

  const handleExportYolo = useCallback(() => {
    // Open export download in new tab
    window.open(getYoloExportUrl(0.8), '_blank');
  }, []);

  const handleDeleteImage = useCallback(
    (filename: string) => {
      if (confirm(`Delete "${filename}" and all its annotations?`)) {
        deleteImage(filename);
      }
    },
    [deleteImage]
  );

  const loading = imagesLoading || annotationsLoading;

  // Show project manager if no project is open
  if (!currentProject) {
    return <ProjectManager onOpenProject={handleOpenProject} />;
  }

  return (
    <div className="flex h-screen flex-col bg-white dark:bg-gray-900">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center gap-3">
          <button
            onClick={handleCloseProject}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
            title="Back to projects"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
          </button>
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">
              {currentProject.name}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {/* Progress indicator */}
          <div className="flex items-center gap-2">
            <div className="h-2 w-32 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                className="h-full rounded-full bg-green-500 transition-all duration-300"
                style={{
                  width: images.length > 0 ? `${(annotatedCount / images.length) * 100}%` : '0%',
                }}
              />
            </div>
            <span className="text-sm text-gray-600 dark:text-gray-300">
              {annotatedCount}/{images.length}
            </span>
          </div>
          {/* Dark mode toggle */}
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
            title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {darkMode ? (
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z"
                  clipRule="evenodd"
                />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* Toolbar */}
      <Toolbar
        toolMode={toolMode}
        currentLabel={currentLabel}
        labels={labels}
        onToolModeChange={setToolMode}
        onLabelChange={setCurrentLabel}
        onPrevImage={prevImage}
        onNextImage={nextImage}
        onClearAnnotations={handleClearAnnotations}
        onExportYolo={handleExportYolo}
        imageIndex={currentIndex}
        imageCount={images.length}
      />

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar - Images */}
        <aside className="flex w-64 flex-col border-r border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <div className="border-b border-gray-200 p-3 dark:border-gray-700">
            <h2 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">Images</h2>
            <ImageUpload onUpload={uploadImages} disabled={loading} />
          </div>
          <div className="flex-1 overflow-y-auto">
            <ImageList
              images={images}
              currentImage={currentImage}
              onSelectImage={selectImage}
              onDeleteImage={handleDeleteImage}
            />
          </div>
        </aside>

        {/* Canvas area */}
        <main className="flex-1 overflow-hidden bg-gray-100 dark:bg-gray-950">
          <AnnotationCanvas
            imageUrl={currentImage ? getImageUrl(currentImage) : null}
            annotations={annotations}
            selectedId={selectedId}
            toolMode={toolMode}
            currentLabel={currentLabel}
            currentClassId={labels.indexOf(currentLabel)}
            onSelectAnnotation={selectAnnotation}
            onAddAnnotation={handleAddAnnotation}
            onUpdateBbox={handleUpdateBbox}
            onDeleteAnnotation={handleDeleteAnnotation}
          />
        </main>

        {/* Right sidebar - Annotations */}
        <aside className="flex w-64 flex-col border-l border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <div className="border-b border-gray-200 p-3 dark:border-gray-700">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Annotations ({annotations.length})
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            <AnnotationList
              annotations={annotations}
              selectedId={selectedId}
              onSelectAnnotation={selectAnnotation}
              onDeleteAnnotation={handleDeleteAnnotation}
            />
          </div>
        </aside>
      </div>

      {/* Status bar */}
      <footer className="border-t border-gray-200 bg-gray-50 px-4 py-2 text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
        <div className="flex items-center justify-between">
          <span>
            {loading ? 'Loading...' : 'Ready'} | Press{' '}
            <kbd className="rounded bg-gray-200 px-1 dark:bg-gray-700">D</kbd> to draw,{' '}
            <kbd className="rounded bg-gray-200 px-1 dark:bg-gray-700">V</kbd> to select,{' '}
            <kbd className="rounded bg-gray-200 px-1 dark:bg-gray-700">←</kbd>
            <kbd className="rounded bg-gray-200 px-1 dark:bg-gray-700">→</kbd> to navigate
          </span>
          <span>{currentImage && `${currentImage}`}</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
