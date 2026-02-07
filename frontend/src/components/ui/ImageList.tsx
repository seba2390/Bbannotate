import { useId } from 'react';
import { getImageUrl } from '@/lib/api';

interface ImageListProps {
  images: string[];
  currentImage: string | null;
  doneStatus: Record<string, boolean>;
  selectedImages: Set<string>;
  onSelectImage: (filename: string) => void;
  onDeleteImage: (filename: string) => void;
  onSelectedImagesChange: (updater: (prev: Set<string>) => Set<string>) => void;
  onDeleteSelectedImages: () => void;
}

/**
 * Sidebar list of images with thumbnails.
 * Shows a green checkmark badge on images marked as done.
 * Supports multi-select via checkboxes for bulk operations.
 */
export function ImageList({
  images,
  currentImage,
  doneStatus,
  selectedImages,
  onSelectImage,
  onDeleteImage,
  onSelectedImagesChange,
  onDeleteSelectedImages,
}: ImageListProps): JSX.Element {
  const checkboxIdPrefix = useId();

  if (images.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
        No images uploaded yet
      </div>
    );
  }

  const handleCheckboxChange = (filename: string, checked: boolean): void => {
    onSelectedImagesChange((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(filename);
      } else {
        next.delete(filename);
      }
      return next;
    });
  };

  const handleSelectAll = (): void => {
    if (selectedImages.size === images.length) {
      // Deselect all
      onSelectedImagesChange(() => new Set());
    } else {
      // Select all
      onSelectedImagesChange(() => new Set(images));
    }
  };

  const allSelected = selectedImages.size === images.length && images.length > 0;

  return (
    <div className="flex flex-col">
      {/* Select all / Delete selected controls */}
      <div className="flex items-center justify-between border-b border-gray-200 px-2 py-1.5 dark:border-gray-700">
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
          <div className="relative">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={handleSelectAll}
              className="peer sr-only"
            />
            <div
              className={`flex h-4 w-4 items-center justify-center rounded border-2 transition-all duration-150 peer-focus:ring-2 peer-focus:ring-primary-500/20 ${allSelected ? 'border-primary-500 bg-primary-500 dark:border-primary-400' : 'border-gray-300 bg-white hover:border-primary-400 dark:border-gray-500 dark:bg-gray-700 dark:hover:border-primary-400'}`}
            >
              <svg
                className={`h-2.5 w-2.5 text-white transition-all duration-150 ${allSelected ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`}
                fill="none"
                stroke="currentColor"
                strokeWidth={3}
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
          Select all
        </label>
        {selectedImages.size > 0 && (
          <button
            onClick={onDeleteSelectedImages}
            className="rounded px-2 py-0.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            Delete {selectedImages.size}
          </button>
        )}
      </div>

      {/* Image list */}
      <div className="flex flex-col gap-2 p-2">
        {images.map((filename, index) => {
          const isDone = doneStatus[filename] ?? false;
          const isSelected = selectedImages.has(filename);
          const checkboxId = `${checkboxIdPrefix}-${index}`;

          return (
            <div
              key={filename}
              className={`
                group relative flex cursor-pointer items-center gap-2 rounded-lg p-2 transition-colors
                ${currentImage === filename ? 'bg-primary-100 ring-2 ring-primary-500 dark:bg-primary-900/30' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}
                ${isDone ? 'border-l-4 border-green-500' : ''}
                ${isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''}
              `}
              onClick={() => onSelectImage(filename)}
            >
              {/* Custom styled checkbox for multi-select */}
              <label className="relative flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                <input
                  id={checkboxId}
                  type="checkbox"
                  checked={isSelected}
                  onChange={(e) => {
                    handleCheckboxChange(filename, e.target.checked);
                  }}
                  className="peer sr-only"
                />
                <div className="flex h-4 w-4 cursor-pointer items-center justify-center rounded border-2 border-gray-300 bg-white transition-all duration-150 hover:border-primary-400 peer-checked:border-primary-500 peer-checked:bg-primary-500 peer-focus:ring-2 peer-focus:ring-primary-500/20 dark:border-gray-500 dark:bg-gray-700 dark:hover:border-primary-400 dark:peer-checked:border-primary-400 dark:peer-checked:bg-primary-500">
                  <svg
                    className={`h-2.5 w-2.5 text-white transition-all duration-150 ${isSelected ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={3}
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </label>
              <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded bg-gray-200 dark:bg-gray-700">
                <img
                  src={getImageUrl(filename)}
                  alt={filename}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
                {/* Done indicator badge */}
                {isDone && (
                  <div className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-white shadow-sm">
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={3}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className={`truncate text-sm font-medium ${isDone ? 'text-green-700 dark:text-green-400' : 'text-gray-900 dark:text-gray-100'}`}
                >
                  {index + 1}. {filename}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteImage(filename);
                }}
                className="absolute right-2 top-2 hidden rounded p-1 text-gray-400 hover:bg-red-100 hover:text-red-500 group-hover:block dark:hover:bg-red-900/30"
                title="Delete image"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
