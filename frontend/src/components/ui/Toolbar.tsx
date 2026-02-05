import type { ToolMode } from '@/types';

interface ToolbarProps {
  toolMode: ToolMode;
  onToolModeChange: (mode: ToolMode) => void;
  onPrevImage: () => void;
  onNextImage: () => void;
  onExport: () => void;
  imageIndex: number;
  imageCount: number;
}

/**
 * Main toolbar with navigation and export.
 */
export function Toolbar({
  onPrevImage,
  onNextImage,
  onExport,
  imageIndex,
  imageCount,
}: ToolbarProps): JSX.Element {
  return (
    <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2 dark:border-gray-700 dark:bg-gray-800">
      {/* Left spacer */}
      <div className="flex-1" />

      {/* Center: Navigation */}
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
      </div>

      {/* Right: Export */}
      <div className="flex flex-1 justify-end">
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
