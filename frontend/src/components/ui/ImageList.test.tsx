import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ImageList } from '@/components/ui/ImageList';

const mockImages = ['image1.png', 'image2.jpg', 'image3.png'];

const defaultProps = {
  images: mockImages,
  currentImage: 'image1.png',
  doneStatus: {},
  onSelectImage: vi.fn(),
  onDeleteImage: vi.fn(),
};

describe('ImageList', () => {
  it('should render all images', () => {
    render(<ImageList {...defaultProps} />);

    expect(screen.getByText(/image1\.png/)).toBeInTheDocument();
    expect(screen.getByText(/image2\.jpg/)).toBeInTheDocument();
    expect(screen.getByText(/image3\.png/)).toBeInTheDocument();
  });

  it('should display image indices', () => {
    render(<ImageList {...defaultProps} />);

    expect(screen.getByText(/1\. image1\.png/)).toBeInTheDocument();
    expect(screen.getByText(/2\. image2\.jpg/)).toBeInTheDocument();
    expect(screen.getByText(/3\. image3\.png/)).toBeInTheDocument();
  });

  it('should show empty message when no images', () => {
    render(<ImageList {...defaultProps} images={[]} currentImage={null} />);

    expect(screen.getByText(/no images uploaded yet/i)).toBeInTheDocument();
  });

  it('should call onSelectImage when image is clicked', async () => {
    const onSelectImage = vi.fn();
    const user = userEvent.setup();
    render(<ImageList {...defaultProps} onSelectImage={onSelectImage} />);

    await user.click(screen.getByText(/2\. image2\.jpg/));

    expect(onSelectImage).toHaveBeenCalledWith('image2.jpg');
  });

  it('should render image thumbnails with correct src', () => {
    render(<ImageList {...defaultProps} />);

    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(3);
    expect(images[0]).toHaveAttribute('src', '/api/images/image1.png');
    expect(images[1]).toHaveAttribute('src', '/api/images/image2.jpg');
  });

  it('should render images with alt text', () => {
    render(<ImageList {...defaultProps} />);

    expect(screen.getByAltText('image1.png')).toBeInTheDocument();
    expect(screen.getByAltText('image2.jpg')).toBeInTheDocument();
    expect(screen.getByAltText('image3.png')).toBeInTheDocument();
  });

  it('should highlight current image', () => {
    const { container } = render(<ImageList {...defaultProps} currentImage="image2.jpg" />);

    // The current image should have the ring-2 class
    const items = container.querySelectorAll('[class*="ring-2"]');
    expect(items).toHaveLength(1);
  });
});
