import { useState, useEffect, useCallback } from 'react';
import {
  AnnotationCanvas,
  ImageUpload,
  ImageList,
  AnnotationList,
  Toolbar,
  ProjectManager,
  LabelManager,
  ExportDialog,
  ToastContainer,
  useToast,
  ConfirmDialog,
} from '@/components';
import { useAnnotations, useImages } from '@/hooks';
import {
  getImageUrl,
  getProjectInfo,
  closeProject,
  markImageDone,
  getAllDoneStatus,
} from '@/lib/api';
import type { ToolMode, DrawingRect, BoundingBox, Project } from '@/types';

/** Default labels for grocery flyer annotation */
const DEFAULT_LABELS = ['product', 'price', 'brand', 'promo'];

/** Load labels from localStorage or use defaults */
function loadLabels(): string[] {
  if (typeof window === 'undefined') return DEFAULT_LABELS;
  const stored = localStorage.getItem('annotationLabels');
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as unknown;
      if (
        Array.isArray(parsed) &&
        parsed.length > 0 &&
        parsed.every((l) => typeof l === 'string')
      ) {
        return parsed as string[];
      }
    } catch {
      // Ignore parse errors
    }
  }
  return DEFAULT_LABELS;
}

/** Save labels to localStorage */
function saveLabels(labels: string[]): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('annotationLabels', JSON.stringify(labels));
  }
}

/**
 * Main application component for bounding box annotation.
 */
function App(): JSX.Element {
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [toolMode, setToolMode] = useState<ToolMode>('draw');
  const [labels, setLabels] = useState<string[]>(loadLabels);
  const [currentLabel, setCurrentLabel] = useState(labels[0] ?? 'product');
  const [showLabelManager, setShowLabelManager] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
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
  const [doneCount, setDoneCount] = useState(0);
  const [doneStatus, setDoneStatus] = useState<Record<string, boolean>>({});
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    destructive?: boolean;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });
  const { toasts, addToast, removeToast } = useToast();

  const {
    images,
    currentImage,
    currentIndex,
    loading: imagesLoading,
    error: imagesError,
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
    error: annotationsError,
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
    setDoneStatus({});
    setDoneCount(0);
  }, []);

  // Helper to show confirm dialog
  const showConfirm = useCallback(
    (title: string, message: string, onConfirm: () => void, destructive = false) => {
      setConfirmDialog({ isOpen: true, title, message, onConfirm, destructive });
    },
    []
  );

  const closeConfirm = useCallback(() => {
    setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
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

  // Show errors from hooks as toasts
  useEffect(() => {
    if (imagesError) {
      addToast(imagesError, 'error');
    }
  }, [imagesError, addToast]);

  useEffect(() => {
    if (annotationsError) {
      addToast(annotationsError, 'error');
    }
  }, [annotationsError, addToast]);

  // Load project info and done status for progress tracking
  useEffect(() => {
    const loadProgress = async (): Promise<void> => {
      try {
        const [info, status] = await Promise.all([getProjectInfo(), getAllDoneStatus()]);
        setDoneCount(info.done_image_count);
        setDoneStatus(status);
      } catch {
        // Ignore errors
      }
    };
    if (currentProject) {
      loadProgress();
    }
  }, [currentProject, images]);

  // Handle delete annotation (exposed for keyboard shortcut)
  const handleDeleteSelected = useCallback((): void => {
    if (selectedId && currentImage) {
      deleteAnnotation(currentImage, selectedId);
    }
  }, [selectedId, currentImage, deleteAnnotation]);

  // Handle deselect (exposed for keyboard shortcut)
  const handleDeselect = useCallback((): void => {
    selectAnnotation(null);
  }, [selectAnnotation]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      // Ignore if typing in input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      switch (e.key) {
        case 's':
        case 'S':
          setToolMode('select');
          break;
        case 'd':
        case 'D':
          setToolMode('draw');
          break;
        case ' ':
          e.preventDefault(); // Prevent page scroll
          setToolMode('pan');
          break;
        case 'ArrowLeft':
          prevImage();
          break;
        case 'ArrowRight':
          nextImage();
          break;
        case 'Delete':
        case 'Backspace':
          handleDeleteSelected();
          break;
        case 'Escape':
          handleDeselect();
          break;
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
        case '6':
        case '7':
        case '8':
        case '9': {
          const idx = parseInt(e.key, 10) - 1;
          if (idx < labels.length) {
            setCurrentLabel(labels[idx] ?? currentLabel);
          }
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [prevImage, nextImage, handleDeleteSelected, handleDeselect, labels, currentLabel]);

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
    showConfirm(
      'Clear Annotations',
      'Clear all annotations for this image?',
      () => {
        clearAnnotations(currentImage);
        closeConfirm();
      },
      true
    );
  }, [currentImage, clearAnnotations, showConfirm, closeConfirm]);

  const handleExport = useCallback((): void => {
    setShowExportDialog(true);
  }, []);

  // Handle marking image as done
  const handleMarkDone = useCallback(async (): Promise<void> => {
    if (!currentImage) return;

    const isCurrentlyDone = doneStatus[currentImage] ?? false;

    // If already done, allow toggling it off
    if (isCurrentlyDone) {
      try {
        await markImageDone(currentImage, false);
        setDoneStatus((prev) => ({ ...prev, [currentImage]: false }));
        setDoneCount((prev) => Math.max(0, prev - 1));
      } catch {
        addToast('Failed to update image status', 'error');
      }
      return;
    }

    // If no annotations, ask if user wants to remove the image
    if (annotations.length === 0) {
      showConfirm(
        'No Annotations',
        'This image has no annotations.\n\nDo you want to remove it from the project?',
        () => {
          deleteImage(currentImage);
          closeConfirm();
        },
        true
      );
      return;
    }

    // Mark as done, update progress, and go to next image
    try {
      await markImageDone(currentImage, true);
      setDoneStatus((prev) => ({ ...prev, [currentImage]: true }));
      setDoneCount((prev) => prev + 1);
      // Go to next image
      nextImage();
    } catch {
      addToast('Failed to mark image as done', 'error');
    }
  }, [
    currentImage,
    annotations,
    doneStatus,
    deleteImage,
    nextImage,
    showConfirm,
    closeConfirm,
    addToast,
  ]);

  // Handle label updates from LabelManager
  const handleLabelsChange = useCallback(
    (newLabels: string[]): void => {
      setLabels(newLabels);
      saveLabels(newLabels);
      // If current label was removed, switch to first label
      if (!newLabels.includes(currentLabel) && newLabels.length > 0) {
        setCurrentLabel(newLabels[0] ?? 'product');
      }
    },
    [currentLabel]
  );

  const handleDeleteImage = useCallback(
    (filename: string) => {
      showConfirm(
        'Delete Image',
        `Delete "${filename}" and all its annotations?`,
        () => {
          deleteImage(filename);
          closeConfirm();
        },
        true
      );
    },
    [deleteImage, showConfirm, closeConfirm]
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
        {/* Left section: Back button & project name */}
        <div className="flex flex-1 items-center gap-3">
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

        {/* Center section: Stylized app name */}
        <div className="flex items-center justify-center">
          <h2 className="bg-gradient-to-r from-primary-500 via-purple-500 to-pink-500 bg-clip-text text-xl font-extrabold tracking-tight text-transparent">
            Bbannotate
          </h2>
        </div>

        {/* Right section: Progress indicator & dark mode */}
        <div className="flex flex-1 items-center justify-end gap-4">
          {/* Progress indicator */}
          <div className="flex items-center gap-2">
            <div className="h-2 w-32 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                className="h-full rounded-full bg-green-500 transition-all duration-300"
                style={{
                  width: images.length > 0 ? `${(doneCount / images.length) * 100}%` : '0%',
                }}
              />
            </div>
            <span className="text-sm text-gray-600 dark:text-gray-300">
              {doneCount}/{images.length}
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
        onExport={handleExport}
        onManageLabels={() => setShowLabelManager(true)}
        onMarkDone={handleMarkDone}
        isCurrentImageDone={currentImage ? (doneStatus[currentImage] ?? false) : false}
        imageIndex={currentIndex}
        imageCount={images.length}
      />

      {/* Label Manager Modal */}
      {showLabelManager && (
        <LabelManager
          labels={labels}
          onLabelsChange={handleLabelsChange}
          onClose={() => setShowLabelManager(false)}
        />
      )}

      {/* Export Dialog Modal */}
      {showExportDialog && <ExportDialog onClose={() => setShowExportDialog(false)} />}

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
              doneStatus={doneStatus}
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
            onToolModeChange={setToolMode}
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
            {loading ? 'Loading...' : 'Ready'} |{' '}
            <kbd className="rounded bg-gray-200 px-1 dark:bg-gray-700">D</kbd> Draw{' '}
            <kbd className="rounded bg-gray-200 px-1 dark:bg-gray-700">S</kbd> Select{' '}
            <kbd className="rounded bg-gray-200 px-1 dark:bg-gray-700">Space</kbd> Pan{' '}
            <kbd className="rounded bg-gray-200 px-1 dark:bg-gray-700">←</kbd>
            <kbd className="rounded bg-gray-200 px-1 dark:bg-gray-700">→</kbd> Navigate{' '}
            <kbd className="rounded bg-gray-200 px-1 dark:bg-gray-700">Del</kbd> Delete{' '}
            <kbd className="rounded bg-gray-200 px-1 dark:bg-gray-700">Esc</kbd> Deselect{' '}
            <kbd className="rounded bg-gray-200 px-1 dark:bg-gray-700">1-9</kbd> Labels
          </span>
          <span>{currentImage && `${currentImage}`}</span>
        </div>
      </footer>

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      {/* Confirm dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={confirmDialog.onConfirm}
        onCancel={closeConfirm}
        destructive={confirmDialog.destructive}
        confirmText={confirmDialog.destructive ? 'Delete' : 'Confirm'}
      />
    </div>
  );
}

export default App;
