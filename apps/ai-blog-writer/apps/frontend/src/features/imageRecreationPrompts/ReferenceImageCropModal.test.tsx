import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ReferenceImageCropModal } from './ReferenceImageCropModal'

const imageUtils = vi.hoisted(() => ({
  calculateDefaultCrop: vi.fn(() => ({
    x: 0,
    y: 0,
    width: 1600,
    height: 840,
  })),
  createCroppedImage: vi.fn(async () =>
    new File(['cropped'], 'cropped-open-graph.webp', { type: 'image/webp' }),
  ),
  loadImage: vi.fn(async () => ({
    naturalWidth: 2400,
    naturalHeight: 1600,
  })),
}))

vi.mock('../images', async () => {
  const actual = await vi.importActual<typeof import('../images')>('../images')

  return {
    ...actual,
    calculateDefaultCrop: imageUtils.calculateDefaultCrop,
    createCroppedImage: imageUtils.createCroppedImage,
    loadImage: imageUtils.loadImage,
  }
})

vi.mock('react-easy-crop', () => ({
  default: () => <div data-testid="mock-cropper" />,
}))

describe('ReferenceImageCropModal', () => {
  beforeEach(() => {
    imageUtils.calculateDefaultCrop.mockClear()
    imageUtils.createCroppedImage.mockClear()
    imageUtils.loadImage.mockClear()
  })

  it('renders the shared crop presets instead of the old FLUX-only size list', async () => {
    render(
      <ReferenceImageCropModal
        isOpen
        sourceFile={new File(['source'], 'source.jpg', { type: 'image/jpeg' })}
        sourcePreviewUrl="blob:source.jpg"
        initialPresetId="original"
        onClose={vi.fn()}
        onUseOriginal={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )

    const presetBar = await screen.findByRole('tablist', { name: 'Crop presets' })

    expect(within(presetBar).getByRole('button', { name: /Original/i })).toBeInTheDocument()
    expect(within(presetBar).getByRole('button', { name: /Thumbnail/i })).toBeInTheDocument()
    expect(within(presetBar).getByRole('button', { name: /Square/i })).toBeInTheDocument()
    expect(within(presetBar).getByRole('button', { name: /Wide/i })).toBeInTheDocument()
    expect(within(presetBar).getByRole('button', { name: /Portrait/i })).toBeInTheDocument()
    expect(within(presetBar).getByRole('button', { name: /Hero/i })).toBeInTheDocument()
    expect(within(presetBar).getByRole('button', { name: /Open Graph/i })).toBeInTheDocument()
    expect(within(presetBar).getByRole('button', { name: /Editorial/i })).toBeInTheDocument()
    expect(screen.queryByText('Social 1200 × 624')).not.toBeInTheDocument()
    expect(screen.queryByText('Square 1024 × 1024')).not.toBeInTheDocument()
  })

  it('saves a shared preset crop with the preset dimensions', async () => {
    const onConfirm = vi.fn()

    render(
      <ReferenceImageCropModal
        isOpen
        sourceFile={new File(['source'], 'source.jpg', { type: 'image/jpeg' })}
        sourcePreviewUrl="blob:source.jpg"
        initialPresetId="original"
        onClose={vi.fn()}
        onUseOriginal={vi.fn()}
        onConfirm={onConfirm}
      />,
    )

    await waitFor(() => {
      expect(imageUtils.loadImage).toHaveBeenCalledWith('blob:source.jpg')
    })

    fireEvent.click(screen.getByRole('button', { name: /Open Graph/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Save crop' }))

    await waitFor(() => {
      expect(imageUtils.createCroppedImage).toHaveBeenCalledWith(
        'blob:source.jpg',
        expect.objectContaining({
          x: expect.any(Number),
          y: expect.any(Number),
          width: expect.any(Number),
          height: expect.any(Number),
        }),
        { width: 1200, height: 630 },
        'source-open_graph.png',
      )
    })

    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        presetId: 'open_graph',
        label: 'Open Graph crop',
        width: 1200,
        height: 630,
        file: expect.any(File),
      }),
    )
  })
})
