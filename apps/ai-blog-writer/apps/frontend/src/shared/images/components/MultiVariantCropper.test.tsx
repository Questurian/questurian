/* @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMultiVariantImages } from '../utils/imageProcessing';
import { MultiVariantCropper } from './MultiVariantCropper';

vi.mock('react-easy-crop', async () => {
  const React = await vi.importActual<typeof import('react')>('react');

  function MockCropper(props: {
    crop: { x: number; y: number };
    zoom: number;
    onCropChange: (crop: { x: number; y: number }) => void;
    onCropComplete: (
      croppedArea: { x: number; y: number; width: number; height: number },
      croppedAreaPixels: { x: number; y: number; width: number; height: number }
    ) => void;
  }) {
    React.useEffect(() => {
      props.onCropComplete(
        { x: 0, y: 0, width: 100, height: 100 },
        { x: props.crop.x, y: props.crop.y, width: 100, height: 100 }
      );
    }, [props.crop.x, props.crop.y]);

    return React.createElement(
      'div',
      { 'data-testid': 'mock-cropper' },
      React.createElement('span', { 'data-testid': 'crop-state' }, `crop ${props.crop.x}:${props.crop.y} zoom ${props.zoom}`),
      React.createElement(
        'button',
        {
          type: 'button',
          onClick: () => props.onCropChange({ x: 17, y: 23 }),
        },
        'Move crop'
      )
    );
  }

  return {
    default: MockCropper,
  };
});

vi.mock('../utils/imageProcessing', async () => {
  const actual = await vi.importActual<typeof import('../utils/imageProcessing')>(
    '../utils/imageProcessing'
  );

  return {
    ...actual,
    loadImage: vi.fn(async () => ({ naturalWidth: 1600, naturalHeight: 1200 })),
    createMultiVariantImages: vi.fn(async () => [
      { type: 'thumbnail', file: new File(['thumb'], 'thumb.webp', { type: 'image/webp' }) },
    ]),
  };
});

function renderCropper() {
  const file = new File(['source'], 'source.jpg', { type: 'image/jpeg' });
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const result = render(
    <MultiVariantCropper
      file={file}
      fileNamePrefix="featured"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );

  return { ...result, onConfirm };
}

describe('MultiVariantCropper', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:test-image'),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('does not mark variants complete until the user saves a crop', async () => {
    const { container } = renderCropper();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save & next/i })).toBeEnabled();
    });

    expect(container.querySelectorAll('.stage-article-cropper-variant-btn.completed')).toHaveLength(0);
    expect(screen.getByRole('button', { name: /saved 0\/7/i })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /save & next/i }));

    await waitFor(() => {
      expect(container.querySelectorAll('.stage-article-cropper-variant-btn.completed')).toHaveLength(1);
    });
    expect(screen.getByText('Crop: Square')).toBeInTheDocument();
  });

  it('keeps crop positions when switching variants and only generates after all crops are saved', async () => {
    const { onConfirm } = renderCropper();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save & next/i })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Move crop' }));
    await waitFor(() => {
      expect(screen.getByTestId('crop-state')).toHaveTextContent('crop 17:23');
    });
    fireEvent.click(screen.getByRole('button', { name: /save & next/i }));

    fireEvent.click(screen.getByRole('button', { name: /thumbnail/i }));
    expect(screen.getByTestId('crop-state')).toHaveTextContent('crop 17:23');
    fireEvent.click(screen.getByRole('button', { name: /square/i }));

    for (let index = 1; index < 7; index += 1) {
      const buttonName = index === 6 ? /save crop/i : /save & next/i;
      await waitFor(() => {
        expect(screen.getByRole('button', { name: buttonName })).toBeEnabled();
      });
      fireEvent.click(screen.getByRole('button', { name: buttonName }));
    }

    const generateButton = screen.getByRole('button', { name: /generate crops/i });
    expect(generateButton).toBeEnabled();
    fireEvent.click(generateButton);

    await waitFor(() => {
      expect(createMultiVariantImages).toHaveBeenCalled();
      expect(onConfirm).toHaveBeenCalledWith([
        expect.objectContaining({ type: 'thumbnail' }),
      ]);
    });
  });
});
