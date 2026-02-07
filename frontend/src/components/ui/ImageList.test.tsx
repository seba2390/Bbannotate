import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ImageList } from '@/components/ui/ImageList';

const mockImages = ['image1.png', 'image2.jpg', 'image3.png'];

const defaultProps = {
  images: mockImages,
  currentImage: 'image1.png',
  doneStatus: {},
  selectedImages: new Set<string>(),
  onSelectImage: vi.fn(),
  onDeleteImage: vi.fn(),
  onSelectedImagesChange: vi.fn(),
  onDeleteSelectedImages: vi.fn(),
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
    render(
      <ImageList {...defaultProps} images={[]} currentImage={null} selectedImages={new Set()} />
    );

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

    // The current image should have the bg-primary-100 class (selected state)
    const items = container.querySelectorAll('[class*="bg-primary-100"]');
    expect(items).toHaveLength(1);
  });

  describe('Multi-select functionality', () => {
    it('should render checkboxes for each image', () => {
      render(<ImageList {...defaultProps} />);

      const checkboxes = screen.getAllByRole('checkbox');
      // 3 image checkboxes + 1 select all checkbox
      expect(checkboxes).toHaveLength(4);
    });

    it('should show checkbox as checked when image is selected', () => {
      const selectedImages = new Set(['image2.jpg']);
      render(<ImageList {...defaultProps} selectedImages={selectedImages} />);

      const checkboxes = screen.getAllByRole('checkbox');
      // Select all checkbox (unchecked) + 3 image checkboxes
      expect(checkboxes[1]).not.toBeChecked(); // image1
      expect(checkboxes[2]).toBeChecked(); // image2
      expect(checkboxes[3]).not.toBeChecked(); // image3
    });

    it('should call onSelectedImagesChange when checkbox is clicked', async () => {
      const onSelectedImagesChange = vi.fn();
      const user = userEvent.setup();
      render(<ImageList {...defaultProps} onSelectedImagesChange={onSelectedImagesChange} />);

      const checkboxes = screen.getAllByRole('checkbox');
      await user.click(checkboxes[1]!); // Click first image checkbox

      expect(onSelectedImagesChange).toHaveBeenCalled();
    });

    it('should show delete selected button when images are selected', () => {
      const selectedImages = new Set(['image1.png', 'image2.jpg']);
      render(<ImageList {...defaultProps} selectedImages={selectedImages} />);

      expect(screen.getByText('Delete 2')).toBeInTheDocument();
    });

    it('should not show delete selected button when no images are selected', () => {
      render(<ImageList {...defaultProps} selectedImages={new Set()} />);

      expect(screen.queryByText(/Delete \d/)).not.toBeInTheDocument();
    });

    it('should call onDeleteSelectedImages when delete button is clicked', async () => {
      const onDeleteSelectedImages = vi.fn();
      const selectedImages = new Set(['image1.png']);
      const user = userEvent.setup();
      render(
        <ImageList
          {...defaultProps}
          selectedImages={selectedImages}
          onDeleteSelectedImages={onDeleteSelectedImages}
        />
      );

      await user.click(screen.getByText('Delete 1'));

      expect(onDeleteSelectedImages).toHaveBeenCalled();
    });

    it('should have select all checkbox', () => {
      render(<ImageList {...defaultProps} />);

      expect(screen.getByText('Select all')).toBeInTheDocument();
    });

    it('should check select all when all images are selected', () => {
      const selectedImages = new Set(mockImages);
      render(<ImageList {...defaultProps} selectedImages={selectedImages} />);

      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes[0]).toBeChecked(); // Select all checkbox
    });
  });
});
