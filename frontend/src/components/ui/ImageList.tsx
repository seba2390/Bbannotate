import { getImageUrl } from '@/lib/api';

interface ImageListProps {
  images: string[];
  currentImage: string | null;
  onSelectImage: (filename: string) => void;
  onDeleteImage: (filename: string) => void;
}

/**
 * Sidebar list of images with thumbnails.
 */
export function ImageList({
  images,
  currentImage,
  onSelectImage,
  onDeleteImage,
}: ImageListProps): JSX.Element {
  if (images.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
        No images uploaded yet
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-2">
      {images.map((filename, index) => (
        <div
          key={filename}
          className={`
            group relative flex cursor-pointer items-center gap-2 rounded-lg p-2 transition-colors
            ${currentImage === filename ? 'bg-primary-100 ring-2 ring-primary-500 dark:bg-primary-900/30' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}
          `}
          onClick={() => onSelectImage(filename)}
        >
          <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded bg-gray-200 dark:bg-gray-700">
            <img
              src={getImageUrl(filename)}
              alt={filename}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
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
      ))}
    </div>
  );
}
