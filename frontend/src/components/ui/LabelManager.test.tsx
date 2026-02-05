import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { LabelManager } from '@/components/ui/LabelManager';

const defaultProps = {
  labels: ['product', 'price', 'discount'],
  onLabelsChange: vi.fn(),
  onClose: vi.fn(),
};

describe('LabelManager', () => {
  it('should render all existing labels', () => {
    render(<LabelManager {...defaultProps} />);

    expect(screen.getByText('product')).toBeInTheDocument();
    expect(screen.getByText('price')).toBeInTheDocument();
    expect(screen.getByText('discount')).toBeInTheDocument();
  });

  it('should display label indices', () => {
    render(<LabelManager {...defaultProps} />);

    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('should add a new label', async () => {
    const user = userEvent.setup();
    render(<LabelManager {...defaultProps} />);

    const input = screen.getByPlaceholderText(/new label name/i);
    await user.type(input, 'new-label');
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    await waitFor(() => {
      expect(screen.getByText('new-label')).toBeInTheDocument();
    });
  });

  it('should add label on Enter key', async () => {
    const user = userEvent.setup();
    render(<LabelManager {...defaultProps} />);

    const input = screen.getByPlaceholderText(/new label name/i);
    await user.type(input, 'enter-label{Enter}');

    await waitFor(() => {
      expect(screen.getByText('enter-label')).toBeInTheDocument();
    });
  });

  it('should show error for empty label', async () => {
    const user = userEvent.setup();
    render(<LabelManager {...defaultProps} />);

    await user.click(screen.getByRole('button', { name: /^add$/i }));

    await waitFor(() => {
      expect(screen.getByText(/label cannot be empty/i)).toBeInTheDocument();
    });
  });

  it('should show error for duplicate label', async () => {
    const user = userEvent.setup();
    render(<LabelManager {...defaultProps} />);

    const input = screen.getByPlaceholderText(/new label name/i);
    await user.type(input, 'product');
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    await waitFor(() => {
      expect(screen.getByText(/label already exists/i)).toBeInTheDocument();
    });
  });

  it('should convert labels to lowercase', async () => {
    const user = userEvent.setup();
    render(<LabelManager {...defaultProps} />);

    const input = screen.getByPlaceholderText(/new label name/i);
    await user.type(input, 'UPPERCASE');
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    await waitFor(() => {
      expect(screen.getByText('uppercase')).toBeInTheDocument();
    });
  });

  it('should call onLabelsChange and onClose on save', async () => {
    const onLabelsChange = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<LabelManager {...defaultProps} onLabelsChange={onLabelsChange} onClose={onClose} />);

    // Add a new label first
    const input = screen.getByPlaceholderText(/new label name/i);
    await user.type(input, 'new');
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    // Wait for state to settle before clicking save
    await waitFor(() => {
      expect(screen.getByText('new')).toBeInTheDocument();
    });

    // Click save
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(onLabelsChange).toHaveBeenCalledWith(['product', 'price', 'discount', 'new']);
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('should call onClose when close button clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<LabelManager {...defaultProps} onClose={onClose} />);

    // Find the close button in the header
    const closeButtons = screen.getAllByRole('button');
    const closeButton = closeButtons[0]; // First button is the close X
    await user.click(closeButton!);

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('should show error when trying to remove last label', async () => {
    const user = userEvent.setup();
    render(<LabelManager labels={['only-label']} onLabelsChange={vi.fn()} onClose={vi.fn()} />);

    // Find and click the remove button
    const removeButtons = screen.getAllByTitle('Remove label');
    await user.click(removeButtons[0]!);

    await waitFor(() => {
      expect(screen.getByText(/must have at least one label/i)).toBeInTheDocument();
    });
  });
});
