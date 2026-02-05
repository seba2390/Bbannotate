import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Toolbar } from '@/components/ui/Toolbar';

const defaultProps = {
  toolMode: 'draw' as const,
  currentLabel: 'product',
  labels: ['product', 'price', 'discount'],
  isCurrentImageDone: false,
  onToolModeChange: vi.fn(),
  onLabelChange: vi.fn(),
  onPrevImage: vi.fn(),
  onNextImage: vi.fn(),
  onClearAnnotations: vi.fn(),
  onExport: vi.fn(),
  onManageLabels: vi.fn(),
  onMarkDone: vi.fn(),
  imageIndex: 0,
  imageCount: 5,
};

describe('Toolbar', () => {
  it('should render all labels in dropdown', () => {
    render(<Toolbar {...defaultProps} />);

    const select = screen.getByRole('combobox');
    expect(select).toHaveValue('product');

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(3);
    expect(options[0]).toHaveTextContent('1. product');
    expect(options[1]).toHaveTextContent('2. price');
    expect(options[2]).toHaveTextContent('3. discount');
  });

  it('should call onLabelChange when label is selected', async () => {
    const onLabelChange = vi.fn();
    const user = userEvent.setup();
    render(<Toolbar {...defaultProps} onLabelChange={onLabelChange} />);

    const select = screen.getByRole('combobox');
    await user.selectOptions(select, 'price');

    expect(onLabelChange).toHaveBeenCalledWith('price');
  });

  it('should display current image position', () => {
    render(<Toolbar {...defaultProps} imageIndex={2} imageCount={10} />);

    expect(screen.getByText('3 / 10')).toBeInTheDocument();
  });

  it('should display 0 / 0 when no images', () => {
    render(<Toolbar {...defaultProps} imageCount={0} imageIndex={-1} />);

    expect(screen.getByText('0 / 0')).toBeInTheDocument();
  });

  it('should call onPrevImage when Prev button clicked', async () => {
    const onPrevImage = vi.fn();
    const user = userEvent.setup();
    render(<Toolbar {...defaultProps} onPrevImage={onPrevImage} />);

    await user.click(screen.getByRole('button', { name: /prev/i }));

    expect(onPrevImage).toHaveBeenCalledOnce();
  });

  it('should call onNextImage when Next button clicked', async () => {
    const onNextImage = vi.fn();
    const user = userEvent.setup();
    render(<Toolbar {...defaultProps} onNextImage={onNextImage} />);

    await user.click(screen.getByRole('button', { name: /next/i }));

    expect(onNextImage).toHaveBeenCalledOnce();
  });

  it('should disable navigation buttons when no images', () => {
    render(<Toolbar {...defaultProps} imageCount={0} />);

    expect(screen.getByRole('button', { name: /prev/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
  });

  it('should call onClearAnnotations when Clear button clicked', async () => {
    const onClearAnnotations = vi.fn();
    const user = userEvent.setup();
    render(<Toolbar {...defaultProps} onClearAnnotations={onClearAnnotations} />);

    await user.click(screen.getByRole('button', { name: /clear/i }));

    expect(onClearAnnotations).toHaveBeenCalledOnce();
  });

  it('should call onExport when Export button clicked', async () => {
    const onExport = vi.fn();
    const user = userEvent.setup();
    render(<Toolbar {...defaultProps} onExport={onExport} />);

    await user.click(screen.getByRole('button', { name: /export/i }));

    expect(onExport).toHaveBeenCalledOnce();
  });

  it('should call onManageLabels when settings button clicked', async () => {
    const onManageLabels = vi.fn();
    const user = userEvent.setup();
    render(<Toolbar {...defaultProps} onManageLabels={onManageLabels} />);

    await user.click(screen.getByRole('button', { name: /manage labels/i }));

    expect(onManageLabels).toHaveBeenCalledOnce();
  });
});
