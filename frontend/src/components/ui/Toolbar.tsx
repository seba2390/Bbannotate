import type { ToolMode } from '@/types';

interface ToolbarProps {
  toolMode: ToolMode;
  currentLabel: string;
  labels: string[];
  isCurrentImageDone: boolean;
  onToolModeChange: (mode: ToolMode) => void;
  onLabelChange: (label: string) => void;
  onPrevImage: () => void;
  onNextImage: () => void;
  onClearAnnotations: () => void;
  onExport: () => void;
  onManageLabels: () => void;
  onMarkDone: () => void;
  imageIndex: number;
  imageCount: number;
}

/**
 * Main toolbar with label selection, navigation, and done button.
 */
export function Toolbar({
  currentLabel,
  labels,
  isCurrentImageDone,
  onLabelChange,
  onPrevImage,
  onNextImage,
  onClearAnnotations,
  onExport,
  onManageLabels,
  onMarkDone,
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
          {labels.map((label, idx) => (
            <option key={label} value={label}>
              {idx + 1}. {label}
            </option>
          ))}
        </select>
        <button
          onClick={onManageLabels}
          className="rounded-lg border border-gray-300 bg-white p-1.5 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
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

      {/* Navigation & Actions */}
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

        {/* Done button */}
        <button
          onClick={onMarkDone}
          disabled={imageCount === 0}
          className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
            isCurrentImageDone
              ? 'border border-green-500 bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50'
              : 'bg-green-600 text-white hover:bg-green-700'
          }`}
          title={isCurrentImageDone ? 'Image marked as done (click to undo)' : 'Mark image as done'}
        >
          {isCurrentImageDone ? (
            <span className="flex items-center gap-1">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Done
            </span>
          ) : (
            'Done ✓'
          )}
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
          onClick={onExport}
          className="rounded-lg bg-primary-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
          title="Export annotations"
        >
          Export
        </button>
      </div>
    </div>
  );
}
