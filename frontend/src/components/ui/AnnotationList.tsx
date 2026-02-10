import type { Annotation } from '@/types';
import { getLabelColor } from '@/lib/constants';

interface AnnotationListProps {
  annotations: Annotation[];
  selectedId: string | null;
  onSelectAnnotation: (id: string) => void;
  onDeleteAnnotation: (id: string) => void;
}

/**
 * List of annotations for the current image.
 */
export function AnnotationList({
  annotations,
  selectedId,
  onSelectAnnotation,
  onDeleteAnnotation,
}: AnnotationListProps): JSX.Element {
  if (annotations.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
        No annotations yet. Draw bounding boxes on the image.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 p-2">
      {annotations.map((ann, index) => {
        const color = getLabelColor(ann.label);
        return (
          <div
            key={ann.id}
            className={`
              group flex cursor-pointer items-center gap-2 rounded-lg p-2 transition-all
              ${
                selectedId === ann.id
                  ? 'bg-gradient-to-r from-white to-primary-50 ring-2 shadow-sm dark:from-gray-700 dark:to-primary-900/30'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-700'
              }
            `}
            style={{ '--tw-ring-color': color } as React.CSSProperties}
            onClick={() => onSelectAnnotation(ann.id)}
            aria-selected={selectedId === ann.id}
          >
            <div
              className={`h-4 w-4 flex-shrink-0 rounded ${
                selectedId === ann.id ? 'ring-2 ring-white dark:ring-gray-900' : ''
              }`}
              style={{ backgroundColor: color }}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {index + 1}. {ann.label}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Class ID: {ann.class_id}</p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeleteAnnotation(ann.id);
              }}
              className="hidden rounded p-1 text-gray-400 hover:bg-red-100 hover:text-red-500 group-hover:block dark:hover:bg-red-900/30"
              title="Delete annotation"
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
  );
}
