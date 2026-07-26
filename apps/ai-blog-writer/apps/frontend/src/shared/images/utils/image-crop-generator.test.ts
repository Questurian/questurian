import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadImage } from './browser-image-loader'
import {
  createCroppedImage,
  createMultiVariantImages
} from './image-crop-generator'
import { initializeCropStates } from './image-crop-state'
import { VARIANT_SEQUENCE } from './image-variant-policy'

vi.mock('./browser-image-loader', () => ({
  loadImage: vi.fn()
}))

const mockedLoadImage = vi.mocked(loadImage)

describe('image crop generation', () => {
  const sourceImage = {} as HTMLImageElement
  const drawImage = vi.fn()
  let canvas: HTMLCanvasElement

  beforeEach(() => {
    mockedLoadImage.mockResolvedValue(sourceImage)
    canvas = document.createElement('canvas')
    vi.spyOn(canvas, 'getContext').mockReturnValue({
      drawImage
    } as unknown as CanvasRenderingContext2D)
    vi.spyOn(canvas, 'toBlob').mockImplementation((callback) => {
      callback(new Blob(['webp'], { type: 'image/webp' }))
    })
    vi.spyOn(document, 'createElement').mockReturnValue(canvas)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it('draws, resizes, and encodes a WebP crop', async () => {
    const file = await createCroppedImage(
      'blob:source',
      { x: 10, y: 20, width: 300, height: 200 },
      { width: 1200, height: 800 },
      'photo.jpeg'
    )

    expect(mockedLoadImage).toHaveBeenCalledWith('blob:source')
    expect(canvas).toMatchObject({ width: 1200, height: 800 })
    expect(drawImage).toHaveBeenCalledWith(
      sourceImage,
      10,
      20,
      300,
      200,
      0,
      0,
      1200,
      800
    )
    expect(canvas.toBlob).toHaveBeenCalledWith(
      expect.any(Function),
      'image/webp',
      0.85
    )
    expect(file).toMatchObject({
      name: 'photo.webp',
      type: 'image/webp'
    })
  })

  it('rejects when a 2D canvas context is unavailable', async () => {
    vi.mocked(canvas.getContext).mockReturnValue(null)

    await expect(
      createCroppedImage(
        'blob:source',
        { x: 0, y: 0, width: 100, height: 100 },
        { width: 100, height: 100 },
        'photo.jpg'
      )
    ).rejects.toThrow('Failed to get canvas context')
  })

  it('rejects when the browser cannot encode a blob', async () => {
    vi.mocked(canvas.toBlob).mockImplementation((callback) => callback(null))

    await expect(
      createCroppedImage(
        'blob:source',
        { x: 0, y: 0, width: 100, height: 100 },
        { width: 100, height: 100 },
        'photo.jpg'
      )
    ).rejects.toThrow('Failed to create blob from canvas')
  })

  it('creates every variant in policy order with normalized names', async () => {
    const states = initializeCropStates(1600, 1200)
    for (const type of VARIANT_SEQUENCE) {
      states[type].croppedAreaPixels = states[type].draftAreaPixels
      states[type].completed = true
    }

    const variants = await createMultiVariantImages(
      'blob:source',
      states,
      'ignored.jpg',
      '  Café Feature  '
    )

    expect(variants.map(({ type }) => type)).toEqual(VARIANT_SEQUENCE)
    expect(variants.map(({ file }) => file.name)).toEqual(
      VARIANT_SEQUENCE.map((type) => `cafe-feature_${type}.webp`)
    )
  })

  it('fails before generation when a confirmed crop is missing', async () => {
    const states = initializeCropStates(1600, 1200)
    const draftCrop = states.thumbnail.draftAreaPixels
    states.thumbnail.croppedAreaPixels = draftCrop
    states.thumbnail.completed = true

    await expect(
      createMultiVariantImages('blob:source', states, 'photo.jpg')
    ).rejects.toThrow('Missing crop data for variant: square')
  })
})
