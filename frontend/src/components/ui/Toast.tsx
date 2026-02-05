import { useState, useEffect, useCallback } from 'react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (message: string, type?: ToastType) => void;
  removeToast: (id: string) => void;
}

/** Default duration for toasts in milliseconds */
const TOAST_DURATION = 4000;

/**
 * Custom hook for managing toast notifications.
 */
export function useToast(): ToastContextValue {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (message: string, type: ToastType = 'info') => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, message, type }]);

      // Auto-remove after duration
      setTimeout(() => {
        removeToast(id);
      }, TOAST_DURATION);
    },
    [removeToast]
  );

  return { toasts, addToast, removeToast };
}

interface ToastContainerProps {
  toasts: Toast[];
  onRemove: (id: string) => void;
}

const TOAST_STYLES: Record<ToastType, string> = {
  success: 'bg-green-600 text-white',
  error: 'bg-red-600 text-white',
  info: 'bg-gray-800 text-white dark:bg-gray-700',
};

/**
 * Container for displaying toast notifications.
 */
export function ToastContainer({ toasts, onRemove }: ToastContainerProps): React.ReactNode {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  );
}

interface ToastItemProps {
  toast: Toast;
  onRemove: (id: string) => void;
}

function ToastItem({ toast, onRemove }: ToastItemProps): React.ReactNode {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    // Start exit animation shortly before removal
    const timer = setTimeout(() => {
      setIsExiting(true);
    }, TOAST_DURATION - 300);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className={`
        ${TOAST_STYLES[toast.type]}
        ${isExiting ? 'opacity-0 translate-x-2' : 'opacity-100 translate-x-0'}
        transition-all duration-300 ease-in-out
        px-4 py-3 rounded-lg shadow-lg
        flex items-center justify-between gap-3
        min-w-[250px] max-w-[400px]
      `}
      role="alert"
    >
      <span className="text-sm font-medium">{toast.message}</span>
      <button
        type="button"
        onClick={() => onRemove(toast.id)}
        className="text-white/80 hover:text-white transition-colors"
        aria-label="Dismiss"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
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
}
