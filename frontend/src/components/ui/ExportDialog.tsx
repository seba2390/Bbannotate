import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  EXPORT_FORMATS,
  getExportUrl,
  getProjectInfo,
  type ExportFormat,
  type DataSplit,
} from '@/lib/api';

interface ExportDialogProps {
  onClose: () => void;
}

interface SplitOption {
  trainCount: number;
  valCount: number;
  trainRatio: number;
  valRatio: number;
  label: string;
}

/**
 * Generate all feasible train/val splits for a given number of images.
 * Each split puts at least 1 image in each set.
 * Returns splits sorted by train count (descending).
 */
function generateFeasibleSplits(totalImages: number): SplitOption[] {
  if (totalImages < 2) {
    return [];
  }

  const splits: SplitOption[] = [];
  // Generate splits from N-1/1 down to 1/N-1 (train/val)
  for (let trainCount = totalImages - 1; trainCount >= 1; trainCount--) {
    const valCount = totalImages - trainCount;
    splits.push({
      trainCount,
      valCount,
      trainRatio: trainCount / totalImages,
      valRatio: valCount / totalImages,
      label: `${trainCount}/${valCount}`,
    });
  }
  return splits;
}

/**
 * Find the split index closest to a target train ratio (e.g., 0.8 for 80%).
 */
function findClosestSplitIndex(splits: SplitOption[], targetRatio: number): number {
  const firstSplit = splits[0];
  if (!firstSplit) return 0;

  let closestIndex = 0;
  let closestDiff = Math.abs(firstSplit.trainRatio - targetRatio);

  for (let i = 1; i < splits.length; i++) {
    const split = splits[i];
    if (!split) continue;
    const diff = Math.abs(split.trainRatio - targetRatio);
    if (diff < closestDiff) {
      closestDiff = diff;
      closestIndex = i;
    }
  }

  return closestIndex;
}

/**
 * Modal dialog for exporting annotations in various formats.
 */
export function ExportDialog({ onClose }: ExportDialogProps): JSX.Element {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('yolo');
  const [selectedSplitIndex, setSelectedSplitIndex] = useState<number>(0);
  const [isExporting, setIsExporting] = useState(false);
  const [doneImageCount, setDoneImageCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const sliderRef = useRef<HTMLDivElement>(null);

  // Fetch done image count on mount
  useEffect(() => {
    const fetchCount = async (): Promise<void> => {
      try {
        const info = await getProjectInfo();
        setDoneImageCount(info.done_image_count);
      } catch {
        setDoneImageCount(0);
      } finally {
        setLoading(false);
      }
    };
    fetchCount();
  }, []);

  // Generate feasible splits based on done image count
  const feasibleSplits = useMemo(() => {
    return generateFeasibleSplits(doneImageCount);
  }, [doneImageCount]);

  // Set default split to closest to 80% when splits are generated
  useEffect(() => {
    if (feasibleSplits.length > 0) {
      const defaultIndex = findClosestSplitIndex(feasibleSplits, 0.8);
      setSelectedSplitIndex(defaultIndex);
    }
  }, [feasibleSplits]);

  const currentSplit = feasibleSplits[selectedSplitIndex] ?? null;

  // Handle slider interaction
  const handleSliderInteraction = useCallback(
    (clientX: number) => {
      if (!sliderRef.current || feasibleSplits.length === 0) return;

      const rect = sliderRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const percentage = Math.max(0, Math.min(1, x / rect.width));

      // Find closest tick
      const tickCount = feasibleSplits.length;
      const tickIndex = Math.round(percentage * (tickCount - 1));
      setSelectedSplitIndex(Math.max(0, Math.min(tickCount - 1, tickIndex)));
    },
    [feasibleSplits]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      setIsDragging(true);
      handleSliderInteraction(e.clientX);
    },
    [handleSliderInteraction]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isDragging) {
        handleSliderInteraction(e.clientX);
      }
    },
    [isDragging, handleSliderInteraction]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (feasibleSplits.length === 0) return;

      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedSplitIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedSplitIndex((prev) => Math.min(feasibleSplits.length - 1, prev + 1));
      } else if (e.key === 'Home') {
        e.preventDefault();
        setSelectedSplitIndex(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        setSelectedSplitIndex(feasibleSplits.length - 1);
      }
    },
    [feasibleSplits.length]
  );

  const handleExport = useCallback((): void => {
    if (!currentSplit) return;

    setIsExporting(true);
    const splitDecimals: DataSplit = {
      train: currentSplit.trainRatio,
      val: currentSplit.valRatio,
    };
    const url = getExportUrl(selectedFormat, splitDecimals);

    // Create a form and submit it to trigger download
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = url;
    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);

    // Close dialog after a short delay
    setTimeout(() => {
      setIsExporting(false);
      onClose();
    }, 1000);
  }, [selectedFormat, currentSplit, onClose]);

  const selectedFormatInfo = EXPORT_FORMATS.find((f) => f.id === selectedFormat);

  // Calculate slider position percentage
  const sliderPosition = useMemo(() => {
    if (feasibleSplits.length <= 1) return 50;
    return (selectedSplitIndex / (feasibleSplits.length - 1)) * 100;
  }, [selectedSplitIndex, feasibleSplits.length]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-2xl dark:bg-gray-800">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Export Annotations
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto px-6 py-4">
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            Choose an export format for your annotations. Only images marked as done will be
            exported.
          </p>

          {/* Format selection */}
          <div className="space-y-2">
            {EXPORT_FORMATS.map((format) => (
              <label
                key={format.id}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                  selectedFormat === format.id
                    ? 'border-primary-500 bg-primary-50 dark:border-primary-400 dark:bg-primary-900/20'
                    : 'border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/50'
                }`}
              >
                <input
                  type="radio"
                  name="format"
                  value={format.id}
                  checked={selectedFormat === format.id}
                  onChange={() => setSelectedFormat(format.id)}
                  className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-white">{format.name}</span>
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                      {format.fileType}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                    {format.description}
                  </p>
                </div>
              </label>
            ))}
          </div>

          {/* YOLO-specific options */}
          {selectedFormat === 'yolo' && (
            <div className="mt-4 rounded-lg bg-gray-50 p-4 dark:bg-gray-700/50">
              <div className="mb-3 flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Train / Validation Split
                </label>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {loading
                    ? 'Loading...'
                    : `${doneImageCount} done image${doneImageCount !== 1 ? 's' : ''}`}
                </span>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-4">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-primary-500" />
                </div>
              ) : doneImageCount === 0 ? (
                <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-900/20">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    No images marked as done. Mark at least one annotated image as done to export.
                  </p>
                </div>
              ) : doneImageCount === 1 ? (
                <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-900/20">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    Only 1 image marked as done. Need at least 2 for train/val split.
                  </p>
                </div>
              ) : (
                <>
                  {/* Current split display */}
                  {currentSplit && (
                    <div className="mb-4 text-center">
                      <div className="inline-flex items-center gap-4 rounded-lg bg-white px-4 py-2 shadow-sm dark:bg-gray-800">
                        <div className="flex items-center gap-2">
                          <div className="h-3 w-3 rounded-full bg-emerald-500" />
                          <span className="text-lg font-semibold text-gray-900 dark:text-white">
                            {currentSplit.trainCount}
                          </span>
                          <span className="text-sm text-gray-500 dark:text-gray-400">train</span>
                        </div>
                        <div className="text-gray-300 dark:text-gray-600">/</div>
                        <div className="flex items-center gap-2">
                          <div className="h-3 w-3 rounded-full bg-amber-500" />
                          <span className="text-lg font-semibold text-gray-900 dark:text-white">
                            {currentSplit.valCount}
                          </span>
                          <span className="text-sm text-gray-500 dark:text-gray-400">val</span>
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {Math.round(currentSplit.trainRatio * 100)}% /{' '}
                        {Math.round(currentSplit.valRatio * 100)}%
                      </div>
                    </div>
                  )}

                  {/* Interactive slider */}
                  <div
                    className="relative py-6"
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                  >
                    {/* Slider track */}
                    <div
                      ref={sliderRef}
                      className="relative h-3 cursor-pointer rounded-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-amber-500"
                      onMouseDown={handleMouseDown}
                      onMouseMove={handleMouseMove}
                      role="slider"
                      aria-valuemin={0}
                      aria-valuemax={feasibleSplits.length - 1}
                      aria-valuenow={selectedSplitIndex}
                      aria-label="Train/Val split"
                      tabIndex={0}
                      onKeyDown={handleKeyDown}
                    >
                      {/* Tick marks */}
                      <div className="absolute inset-0 flex items-center justify-between px-0">
                        {feasibleSplits.map((split, index) => {
                          const position =
                            feasibleSplits.length > 1
                              ? (index / (feasibleSplits.length - 1)) * 100
                              : 50;
                          const isSelected = index === selectedSplitIndex;
                          return (
                            <button
                              key={index}
                              type="button"
                              onClick={() => setSelectedSplitIndex(index)}
                              className="absolute flex flex-col items-center"
                              style={{ left: `${position}%`, transform: 'translateX(-50%)' }}
                              tabIndex={-1}
                            >
                              {/* Tick mark */}
                              <div
                                className={`h-5 w-1 rounded-full transition-all ${
                                  isSelected
                                    ? 'bg-white shadow-lg'
                                    : 'bg-white/60 hover:bg-white/80'
                                }`}
                              />
                              {/* Label below tick - show for first, last, and selected */}
                              {(index === 0 ||
                                index === feasibleSplits.length - 1 ||
                                isSelected) && (
                                <span
                                  className={`mt-2 text-xs font-medium transition-all ${
                                    isSelected
                                      ? 'text-gray-900 dark:text-white'
                                      : 'text-gray-500 dark:text-gray-400'
                                  }`}
                                >
                                  {split.label}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {/* Slider handle */}
                      <div
                        className={`absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white bg-primary-500 shadow-lg transition-all ${
                          isDragging ? 'scale-110 shadow-xl' : 'hover:scale-105'
                        }`}
                        style={{ left: `${sliderPosition}%` }}
                      >
                        <div className="absolute inset-0 rounded-full bg-primary-400 opacity-0 transition-opacity hover:opacity-30" />
                      </div>
                    </div>

                    {/* Axis labels */}
                    <div className="mt-6 flex justify-between text-xs text-gray-500 dark:text-gray-400">
                      <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        More training
                      </span>
                      <span className="flex items-center gap-1">
                        More validation
                        <span className="h-2 w-2 rounded-full bg-amber-500" />
                      </span>
                    </div>
                  </div>

                  {/* Visual split bar */}
                  {currentSplit && (
                    <div className="mt-2">
                      <div className="flex h-8 overflow-hidden rounded-lg shadow-inner">
                        <div
                          className="flex items-center justify-center bg-gradient-to-r from-emerald-600 to-emerald-500 text-sm font-semibold text-white transition-all duration-300"
                          style={{ width: `${currentSplit.trainRatio * 100}%` }}
                        >
                          {currentSplit.trainCount > 0 && (
                            <span className="drop-shadow">{currentSplit.trainCount} train</span>
                          )}
                        </div>
                        <div
                          className="flex items-center justify-center bg-gradient-to-r from-amber-500 to-amber-400 text-sm font-semibold text-white transition-all duration-300"
                          style={{ width: `${currentSplit.valRatio * 100}%` }}
                        >
                          {currentSplit.valCount > 0 && (
                            <span className="drop-shadow">{currentSplit.valCount} val</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {feasibleSplits.length === 1 && (
                    <p className="mt-3 text-xs text-yellow-600 dark:text-yellow-400">
                      Only one split option is available with {doneImageCount} images. Add more
                      images for more options.
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between border-t border-gray-200 px-6 py-4 dark:border-gray-700">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {selectedFormatInfo && (
              <span>
                Will download as <strong>{selectedFormatInfo.fileType}</strong>
              </span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={handleExport}
              disabled={isExporting || doneImageCount < 2}
              className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isExporting ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Exporting...
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  Export
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
