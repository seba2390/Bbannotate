import { useRef } from 'react';

interface ImageUploadProps {
  onUpload: (files: File[]) => void;
  disabled?: boolean;
}

/**
 * Drag-and-drop image upload component.
 */
export function ImageUpload({ onUpload, disabled = false }: ImageUploadProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    if (disabled) return;

    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
    if (files.length > 0) {
      onUpload(files);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
  };

  const handleClick = (): void => {
    inputRef.current?.click();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onUpload(Array.from(files));
    }
    // Reset input so same file can be selected again
    e.target.value = '';
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onClick={handleClick}
      className={`
        flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-4
        transition-colors
        ${disabled ? 'border-gray-200 bg-gray-50 opacity-50 dark:border-gray-700 dark:bg-gray-800' : 'border-gray-300 bg-white hover:border-primary-500 hover:bg-primary-50 dark:border-gray-600 dark:bg-gray-700 dark:hover:border-primary-500 dark:hover:bg-primary-900/20'}
      `}
    >
      <svg className="h-8 w-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
        />
      </svg>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
        Drop images or click to upload
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleChange}
        className="hidden"
        disabled={disabled}
      />
    </div>
  );
}
