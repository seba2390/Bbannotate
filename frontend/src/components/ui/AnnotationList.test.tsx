import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { AnnotationList } from '@/components/ui/AnnotationList';
import type { Annotation } from '@/types';

const mockAnnotations: Annotation[] = [
  {
    id: 'ann-1',
    label: 'product',
    class_id: 0,
    bbox: { x: 0.5, y: 0.5, width: 0.2, height: 0.3 },
  },
  {
    id: 'ann-2',
    label: 'price',
    class_id: 1,
    bbox: { x: 0.3, y: 0.4, width: 0.1, height: 0.15 },
  },
  {
    id: 'ann-3',
    label: 'unknown',
    class_id: 2,
    bbox: { x: 0.7, y: 0.2, width: 0.15, height: 0.25 },
  },
];

const defaultProps = {
  annotations: mockAnnotations,
  selectedId: null,
  onSelectAnnotation: vi.fn(),
  onDeleteAnnotation: vi.fn(),
};

describe('AnnotationList', () => {
  it('should render all annotations', () => {
    render(<AnnotationList {...defaultProps} />);

    expect(screen.getByText(/1\. product/)).toBeInTheDocument();
    expect(screen.getByText(/2\. price/)).toBeInTheDocument();
    expect(screen.getByText(/3\. unknown/)).toBeInTheDocument();
  });

  it('should display class IDs', () => {
    render(<AnnotationList {...defaultProps} />);

    expect(screen.getByText('Class ID: 0')).toBeInTheDocument();
    expect(screen.getByText('Class ID: 1')).toBeInTheDocument();
    expect(screen.getByText('Class ID: 2')).toBeInTheDocument();
  });

  it('should show empty message when no annotations', () => {
    render(<AnnotationList {...defaultProps} annotations={[]} />);

    expect(screen.getByText(/no annotations yet/i)).toBeInTheDocument();
  });

  it('should call onSelectAnnotation when annotation is clicked', async () => {
    const onSelectAnnotation = vi.fn();
    const user = userEvent.setup();
    render(<AnnotationList {...defaultProps} onSelectAnnotation={onSelectAnnotation} />);

    await user.click(screen.getByText(/2\. price/));

    expect(onSelectAnnotation).toHaveBeenCalledWith('ann-2');
  });

  it('should highlight selected annotation', () => {
    const { container } = render(<AnnotationList {...defaultProps} selectedId="ann-2" />);

    const selectedItem = container.querySelector('[aria-selected="true"]');
    expect(selectedItem).not.toBeNull();
    expect(selectedItem?.className).toContain('ring-2');
  });

  it('should render color indicators for each annotation', () => {
    const { container } = render(<AnnotationList {...defaultProps} />);

    // There should be 3 color indicator divs
    const colorDivs = container.querySelectorAll('[style*="background-color"]');
    expect(colorDivs.length).toBeGreaterThanOrEqual(3);
  });
});
