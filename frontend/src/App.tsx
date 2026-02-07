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

/** Default labels - empty so users define their own */
const DEFAULT_LABELS: string[] = [];

/** Get the localStorage key for a project's labels */
function getLabelsKey(projectName: string | null): string {
  return projectName ? `annotationLabels_${projectName}` : 'annotationLabels';
}

/** Load labels from localStorage for a specific project */
function loadLabelsForProject(projectName: string | null): string[] {
  if (typeof window === 'undefined') return DEFAULT_LABELS;
  const stored = localStorage.getItem(getLabelsKey(projectName));
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

/** Save labels to localStorage for a specific project */
function saveLabelsForProject(projectName: string | null, labels: string[]): void {
  if (typeof window !== 'undefined' && projectName) {
    localStorage.setItem(getLabelsKey(projectName), JSON.stringify(labels));
  }
}

/**
 * Main application component for bounding box annotation.
 */
function App(): JSX.Element {
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [toolMode, setToolMode] = useState<ToolMode>('draw');
  const [labels, setLabels] = useState<string[]>(DEFAULT_LABELS);
  const [currentLabel, setCurrentLabel] = useState<string>('');
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
  // Pending annotation when user draws before defining labels
  const [pendingAnnotation, setPendingAnnotation] = useState<{
    rect: DrawingRect;
    imageWidth: number;
    imageHeight: number;
  } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    destructive?: boolean;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
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
    deleteImages,
    refreshImages,
  } = useImages();

  const {
    annotations,
    selectedId,
    loading: annotationsLoading,
    error: annotationsError,
    canUndo,
    loadAnnotations,
    addAnnotation,
    updateAnnotation,
    deleteAnnotation,
    clearAnnotations,
    selectAnnotation,
    updateLocalBbox,
    undoLastAnnotation,
  } = useAnnotations();

  // Handle project open
  const handleOpenProject = useCallback(
    (project: Project): void => {
      setCurrentProject(project);
      // Load labels for this project
      const projectLabels = loadLabelsForProject(project.name);
      setLabels(projectLabels);
      setCurrentLabel(projectLabels[0] ?? '');
      // Refresh images when project opens
      refreshImages();
    },
    [refreshImages]
  );

  // Handle closing project
  const handleCloseProject = useCallback(async (): Promise<void> => {
    await closeProject();
    setCurrentProject(null);
    setLabels(DEFAULT_LABELS);
    setCurrentLabel('');
    setDoneStatus({});
    setDoneCount(0);
    setSelectedImages(new Set());
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

  // Handle undo (exposed for keyboard shortcut)
  const handleUndo = useCallback((): void => {
    if (canUndo) {
      undoLastAnnotation();
    }
  }, [canUndo, undoLastAnnotation]);

  const handleAddAnnotation = useCallback(
    (rect: DrawingRect, imageWidth: number, imageHeight: number) => {
      if (!currentImage) return;
      // If no labels defined, prompt user to create one first
      if (labels.length === 0) {
        setPendingAnnotation({ rect, imageWidth, imageHeight });
        setShowLabelManager(true);
        addToast('Please create a label first before annotating', 'info');
        return;
      }
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
    [currentImage, currentLabel, labels, addAnnotation, addToast]
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
      saveLabelsForProject(currentProject?.name ?? null, newLabels);

      const firstLabel = newLabels[0] ?? '';

      // If current label was removed, switch to first label
      if (!newLabels.includes(currentLabel) && newLabels.length > 0) {
        setCurrentLabel(firstLabel);
      }

      // If there's a pending annotation and we now have labels, create it
      if (pendingAnnotation && currentImage && newLabels.length > 0) {
        addAnnotation(
          currentImage,
          firstLabel,
          0,
          pendingAnnotation.rect,
          pendingAnnotation.imageWidth,
          pendingAnnotation.imageHeight
        );
        setPendingAnnotation(null);
      }
    },
    [currentLabel, currentProject?.name, pendingAnnotation, currentImage, addAnnotation]
  );

  const handleDeleteImage = useCallback(
    (filename: string) => {
      showConfirm(
        'Delete Image',
        `Delete "${filename}" and all its annotations?`,
        () => {
          deleteImage(filename);
          // Also remove from selection if selected
          setSelectedImages((prev) => {
            const next = new Set(prev);
            next.delete(filename);
            return next;
          });
          closeConfirm();
        },
        true
      );
    },
    [deleteImage, showConfirm, closeConfirm]
  );

  const handleDeleteSelectedImages = useCallback(() => {
    if (selectedImages.size === 0) return;
    const count = selectedImages.size;
    showConfirm(
      'Delete Selected Images',
      `Delete ${count} selected image${count > 1 ? 's' : ''} and all their annotations?`,
      async () => {
        await deleteImages(Array.from(selectedImages));
        // Update done count for deleted images
        const deletedDoneCount = Array.from(selectedImages).filter((img) => doneStatus[img]).length;
        setDoneCount((prev) => Math.max(0, prev - deletedDoneCount));
        setSelectedImages(new Set());
        closeConfirm();
      },
      true
    );
  }, [selectedImages, deleteImages, doneStatus, showConfirm, closeConfirm]);

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
        case 'z':
        case 'Z':
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            handleUndo();
          }
          break;
        case 's':
        case 'S':
          // Don't trigger select mode if Cmd/Ctrl is pressed (e.g., Cmd+S for save)
          if (!e.metaKey && !e.ctrlKey) {
            setToolMode('select');
          }
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
        case 'Enter':
          e.preventDefault();
          handleMarkDone();
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
  }, [
    prevImage,
    nextImage,
    handleDeleteSelected,
    handleDeselect,
    handleUndo,
    handleMarkDone,
    labels,
    currentLabel,
  ]);

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
        <div className="flex flex-1 items-center justify-center">
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
        onToolModeChange={setToolMode}
        onPrevImage={prevImage}
        onNextImage={nextImage}
        onExport={handleExport}
        imageIndex={currentIndex}
        imageCount={images.length}
      />

      {/* Label Manager Modal */}
      {showLabelManager && (
        <LabelManager
          labels={labels}
          onLabelsChange={handleLabelsChange}
          onClose={() => {
            setShowLabelManager(false);
            setPendingAnnotation(null);
          }}
        />
      )}

      {/* Export Dialog Modal */}
      {showExportDialog && <ExportDialog onClose={() => setShowExportDialog(false)} />}

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar - Images */}
        <aside className="flex w-64 flex-col border-r border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <div className="border-b border-gray-200 p-3 dark:border-gray-700">
            <h2 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
              Images ({images.length})
            </h2>
            <ImageUpload onUpload={uploadImages} disabled={loading} />
          </div>
          <div className="flex-1 overflow-y-auto">
            <ImageList
              images={images}
              currentImage={currentImage}
              doneStatus={doneStatus}
              selectedImages={selectedImages}
              onSelectImage={selectImage}
              onDeleteImage={handleDeleteImage}
              onSelectedImagesChange={setSelectedImages}
              onDeleteSelectedImages={handleDeleteSelectedImages}
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
            labels={labels}
            isCurrentImageDone={currentImage ? (doneStatus[currentImage] ?? false) : false}
            onSelectAnnotation={selectAnnotation}
            onAddAnnotation={handleAddAnnotation}
            onUpdateBbox={handleUpdateBbox}
            onDeleteAnnotation={handleDeleteAnnotation}
            onToolModeChange={setToolMode}
            onMarkDone={handleMarkDone}
            onLabelChange={setCurrentLabel}
          />
        </main>

        {/* Right sidebar - Annotations */}
        <aside className="flex w-64 flex-col border-l border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          {/* Labels section */}
          <div className="border-b border-gray-200 p-3 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Labels ({labels.length})
              </h2>
              <button
                onClick={() => setShowLabelManager(true)}
                className="rounded p-1 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                title="Manage labels"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </button>
            </div>
            {labels.length === 0 ? (
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                No labels defined. Click the gear icon to add labels.
              </p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-1">
                {labels.map((label, idx) => (
                  <span
                    key={label}
                    className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                  >
                    {idx + 1}. {label}
                  </span>
                ))}
              </div>
            )}
          </div>
          {/* Annotations section */}
          <div className="border-b border-gray-200 p-3 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Annotations ({annotations.length})
              </h2>
              <button
                onClick={handleClearAnnotations}
                disabled={annotations.length === 0}
                className="rounded px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-red-500 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-red-400"
                title="Clear all annotations"
              >
                Clear
              </button>
            </div>
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
      <footer className="border-t border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100 px-4 py-2 text-xs dark:border-gray-700 dark:from-gray-800 dark:to-gray-900">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-1.5">
              <kbd className="rounded-md border border-gray-300 bg-white px-1.5 py-0.5 font-mono text-[10px] font-medium text-gray-600 shadow-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300">
                D
              </kbd>
              <span className="text-gray-500 dark:text-gray-400">Draw</span>
            </div>
            <div className="flex items-center gap-1.5">
              <kbd className="rounded-md border border-gray-300 bg-white px-1.5 py-0.5 font-mono text-[10px] font-medium text-gray-600 shadow-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300">
                S
              </kbd>
              <span className="text-gray-500 dark:text-gray-400">Select</span>
            </div>
            <div className="flex items-center gap-1.5">
              <kbd className="rounded-md border border-gray-300 bg-white px-1.5 py-0.5 font-mono text-[10px] font-medium text-gray-600 shadow-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300">
                Space
              </kbd>
              <span className="text-gray-500 dark:text-gray-400">Pan</span>
            </div>
            <div className="flex items-center gap-1">
              <kbd className="rounded-md border border-gray-300 bg-white px-1.5 py-0.5 font-mono text-[10px] font-medium text-gray-600 shadow-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300">
                ←
              </kbd>
              <kbd className="rounded-md border border-gray-300 bg-white px-1.5 py-0.5 font-mono text-[10px] font-medium text-gray-600 shadow-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300">
                →
              </kbd>
              <span className="ml-0.5 text-gray-500 dark:text-gray-400">Navigate</span>
            </div>
            <div className="flex items-center gap-1.5">
              <kbd className="rounded-md border border-gray-300 bg-white px-1.5 py-0.5 font-mono text-[10px] font-medium text-gray-600 shadow-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300">
                Del
              </kbd>
              <span className="text-gray-500 dark:text-gray-400">Delete</span>
            </div>
            <div className="flex items-center gap-1.5">
              <kbd className="rounded-md border border-gray-300 bg-white px-1.5 py-0.5 font-mono text-[10px] font-medium text-gray-600 shadow-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300">
                ⌘Z
              </kbd>
              <span className="text-gray-500 dark:text-gray-400">Undo</span>
            </div>
            <div className="flex items-center gap-1.5">
              <kbd className="rounded-md border border-gray-300 bg-white px-1.5 py-0.5 font-mono text-[10px] font-medium text-gray-600 shadow-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300">
                Esc
              </kbd>
              <span className="text-gray-500 dark:text-gray-400">Deselect</span>
            </div>
            <div className="flex items-center gap-1.5">
              <kbd className="rounded-md border border-gray-300 bg-white px-1.5 py-0.5 font-mono text-[10px] font-medium text-gray-600 shadow-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300">
                1-9
              </kbd>
              <span className="text-gray-500 dark:text-gray-400">Labels</span>
            </div>
            <div className="flex items-center gap-1.5">
              <kbd className="rounded-md border border-gray-300 bg-white px-1.5 py-0.5 font-mono text-[10px] font-medium text-gray-600 shadow-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300">
                Enter
              </kbd>
              <span className="text-gray-500 dark:text-gray-400">Done</span>
            </div>
          </div>
          <span className="font-medium text-gray-600 dark:text-gray-300">{currentImage ?? ''}</span>
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
