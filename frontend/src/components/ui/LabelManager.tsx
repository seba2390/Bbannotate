import { useState, useCallback } from 'react';

interface LabelManagerProps {
  labels: string[];
  onLabelsChange: (labels: string[]) => void;
  onClose: () => void;
}

/**
 * Modal component for managing custom annotation labels.
 */
export function LabelManager({ labels, onLabelsChange, onClose }: LabelManagerProps): JSX.Element {
  const [editableLabels, setEditableLabels] = useState<string[]>([...labels]);
  const [newLabel, setNewLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleAddLabel = useCallback((): void => {
    const trimmed = newLabel.trim().toLowerCase();
    if (!trimmed) {
      setError('Label cannot be empty');
      return;
    }
    if (editableLabels.includes(trimmed)) {
      setError('Label already exists');
      return;
    }
    setEditableLabels([...editableLabels, trimmed]);
    setNewLabel('');
    setError(null);
  }, [newLabel, editableLabels]);

  const handleRemoveLabel = useCallback(
    (index: number): void => {
      if (editableLabels.length <= 1) {
        setError('Must have at least one label');
        return;
      }
      const updated = editableLabels.filter((_, i) => i !== index);
      setEditableLabels(updated);
      setError(null);
    },
    [editableLabels]
  );

  const handleMoveUp = useCallback(
    (index: number): void => {
      if (index <= 0) return;
      const updated = [...editableLabels];
      [updated[index - 1], updated[index]] = [updated[index] ?? '', updated[index - 1] ?? ''];
      setEditableLabels(updated);
    },
    [editableLabels]
  );

  const handleMoveDown = useCallback(
    (index: number): void => {
      if (index >= editableLabels.length - 1) return;
      const updated = [...editableLabels];
      [updated[index], updated[index + 1]] = [updated[index + 1] ?? '', updated[index] ?? ''];
      setEditableLabels(updated);
    },
    [editableLabels]
  );

  const handleSave = useCallback((): void => {
    if (editableLabels.length === 0) {
      setError('Must have at least one label');
      return;
    }
    onLabelsChange(editableLabels);
    onClose();
  }, [editableLabels, onLabelsChange, onClose]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddLabel();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl bg-white shadow-2xl dark:bg-gray-800">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Manage Labels</h2>
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
        <div className="max-h-96 overflow-y-auto px-6 py-4">
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            Add, remove, or reorder labels. Press 1-9 to quickly select a label while annotating.
          </p>

          {/* Error message */}
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Add new label */}
          <div className="mb-4 flex gap-2">
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="New label name..."
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
            />
            <button
              onClick={handleAddLabel}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
            >
              Add
            </button>
          </div>

          {/* Labels list */}
          <ul className="space-y-2">
            {editableLabels.map((label, index) => (
              <li
                key={`${label}-${index}`}
                className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-700"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded bg-gray-200 text-xs font-medium text-gray-600 dark:bg-gray-600 dark:text-gray-300">
                  {index + 1}
                </span>
                <span className="flex-1 text-sm text-gray-900 dark:text-white">{label}</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleMoveUp(index)}
                    disabled={index === 0}
                    className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600 disabled:opacity-30 dark:hover:bg-gray-600 dark:hover:text-gray-300"
                    title="Move up"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 15l7-7 7 7"
                      />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleMoveDown(index)}
                    disabled={index === editableLabels.length - 1}
                    className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600 disabled:opacity-30 dark:hover:bg-gray-600 dark:hover:text-gray-300"
                    title="Move down"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleRemoveLabel(index)}
                    className="rounded p-1 text-gray-400 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400"
                    title="Remove label"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
