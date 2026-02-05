import { useEffect, useRef } from 'react';

interface ConfirmDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Title for the dialog */
  title: string;
  /** Message/description for the dialog */
  message: string;
  /** Text for the confirm button */
  confirmText?: string;
  /** Text for the cancel button */
  cancelText?: string;
  /** Called when user confirms */
  onConfirm: () => void;
  /** Called when user cancels or closes */
  onCancel: () => void;
  /** Whether this is a destructive action (styles confirm button red) */
  destructive?: boolean;
}

/**
 * Accessible confirmation dialog component.
 * Replaces native window.confirm() for testability and accessibility.
 */
export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  destructive = false,
}: ConfirmDialogProps): React.ReactNode {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      dialog.showModal();
      // Focus the cancel button for destructive actions, confirm for others
      if (destructive) {
        dialog.querySelector<HTMLButtonElement>('[data-cancel]')?.focus();
      } else {
        confirmButtonRef.current?.focus();
      }
    } else {
      dialog.close();
    }
  }, [isOpen, destructive]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && isOpen) {
        onCancel();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-transparent p-4"
      onClick={(e) => {
        // Close when clicking backdrop
        if (e.target === dialogRef.current) {
          onCancel();
        }
      }}
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-message"
    >
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-200">
        <h2
          id="confirm-dialog-title"
          className="text-lg font-semibold text-gray-900 dark:text-white mb-2"
        >
          {title}
        </h2>
        <p
          id="confirm-dialog-message"
          className="text-gray-600 dark:text-gray-300 mb-6 whitespace-pre-line"
        >
          {message}
        </p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            data-cancel
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300
                       bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600
                       rounded-lg transition-colors focus:outline-none focus:ring-2
                       focus:ring-gray-400 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
          >
            {cancelText}
          </button>
          <button
            type="button"
            ref={confirmButtonRef}
            onClick={onConfirm}
            className={`
              px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors
              focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800
              ${
                destructive
                  ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
                  : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'
              }
            `}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </dialog>
  );
}
