import type { ToolMode } from '@/types';

interface ToolbarProps {
  toolMode: ToolMode;
  currentLabel: string;
  labels: string[];
  onToolModeChange: (mode: ToolMode) => void;
  onLabelChange: (label: string) => void;
  onPrevImage: () => void;
  onNextImage: () => void;
  onClearAnnotations: () => void;
  onExportYolo: () => void;
  imageIndex: number;
  imageCount: number;
}

/**
 * Main toolbar with label selection and navigation.
 */
export function Toolbar({
  currentLabel,
  labels,
  onLabelChange,
  onPrevImage,
  onNextImage,
  onClearAnnotations,
  onExportYolo,
  imageIndex,
  imageCount,
}: ToolbarProps): JSX.Element {
  return (
    <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2 dark:border-gray-700 dark:bg-gray-800">
      {/* Label selection */}
      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-600 dark:text-gray-300">Label:</label>
        <select
          value={currentLabel}
          onChange={(e) => onLabelChange(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        >
          {labels.map((label) => (
            <option key={label} value={label}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* Navigation */}
      <div className="flex items-center gap-2">
        <button
          onClick={onPrevImage}
          disabled={imageCount === 0}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
          title="Previous image (←)"
        >
          ← Prev
        </button>
        <span className="min-w-[80px] text-center text-sm text-gray-600 dark:text-gray-300">
          {imageCount > 0 ? `${imageIndex + 1} / ${imageCount}` : '0 / 0'}
        </span>
        <button
          onClick={onNextImage}
          disabled={imageCount === 0}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
          title="Next image (→)"
        >
          Next →
        </button>

        <div className="mx-2 h-6 w-px bg-gray-200 dark:bg-gray-600" />

        <button
          onClick={onClearAnnotations}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
          title="Clear all annotations"
        >
          Clear
        </button>

        <button
          onClick={onExportYolo}
          className="rounded-lg bg-primary-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
          title="Export to YOLO format"
        >
          Export YOLO
        </button>
      </div>
    </div>
  );
}
