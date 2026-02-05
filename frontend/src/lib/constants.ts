/**
 * Shared constants for the annotation tool.
 */

/** Color palette for different annotation labels */
export const LABEL_COLORS: Record<string, string> = {
  product: '#22c55e',
  price: '#3b82f6',
  brand: '#f59e0b',
  promo: '#ef4444',
  default: '#8b5cf6',
};

/**
 * Get the color for a given label.
 * Falls back to the default color if the label is not found.
 *
 * @param label - The label name
 * @returns The hex color string for the label
 */
export function getLabelColor(label: string): string {
  return LABEL_COLORS[label.toLowerCase()] ?? LABEL_COLORS['default'] ?? '#8b5cf6';
}
