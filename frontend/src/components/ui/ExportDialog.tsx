import { useState, useCallback } from 'react';
import { EXPORT_FORMATS, getExportUrl, type ExportFormat } from '@/lib/api';

interface ExportDialogProps {
  onClose: () => void;
}

/**
 * Modal dialog for exporting annotations in various formats.
 */
export function ExportDialog({ onClose }: ExportDialogProps): JSX.Element {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('yolo');
  const [trainSplit, setTrainSplit] = useState(0.8);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = useCallback((): void => {
    setIsExporting(true);
    const url = getExportUrl(selectedFormat, trainSplit);

    // Create a form and submit it to trigger download
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = url;
    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);

    // Close dialog after a short delay
    setTimeout(() => {
      setIsExporting(false);
      onClose();
    }, 1000);
  }, [selectedFormat, trainSplit, onClose]);

  const selectedFormatInfo = EXPORT_FORMATS.find((f) => f.id === selectedFormat);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl dark:bg-gray-800">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Export Annotations
          </h2>
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
        <div className="px-6 py-4">
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            Choose an export format for your annotations. Different formats are compatible with
            different machine learning frameworks.
          </p>

          {/* Format selection */}
          <div className="space-y-2">
            {EXPORT_FORMATS.map((format) => (
              <label
                key={format.id}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                  selectedFormat === format.id
                    ? 'border-primary-500 bg-primary-50 dark:border-primary-400 dark:bg-primary-900/20'
                    : 'border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/50'
                }`}
              >
                <input
                  type="radio"
                  name="format"
                  value={format.id}
                  checked={selectedFormat === format.id}
                  onChange={() => setSelectedFormat(format.id)}
                  className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-white">{format.name}</span>
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                      {format.fileType}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                    {format.description}
                  </p>
                </div>
              </label>
            ))}
          </div>

          {/* YOLO-specific options */}
          {selectedFormat === 'yolo' && (
            <div className="mt-4 rounded-lg bg-gray-50 p-4 dark:bg-gray-700/50">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Train/Validation Split
              </label>
              <div className="mt-2 flex items-center gap-3">
                <input
                  type="range"
                  min="0.5"
                  max="0.95"
                  step="0.05"
                  value={trainSplit}
                  onChange={(e) => setTrainSplit(parseFloat(e.target.value))}
                  className="h-2 flex-1 cursor-pointer appearance-none rounded-lg bg-gray-200 dark:bg-gray-600"
                />
                <span className="min-w-[80px] text-sm text-gray-600 dark:text-gray-300">
                  {Math.round(trainSplit * 100)}% train
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {Math.round((1 - trainSplit) * 100)}% of images will be in the validation set
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4 dark:border-gray-700">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {selectedFormatInfo && (
              <span>
                Will download as <strong>{selectedFormatInfo.fileType}</strong>
              </span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {isExporting ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Exporting...
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  Export
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
