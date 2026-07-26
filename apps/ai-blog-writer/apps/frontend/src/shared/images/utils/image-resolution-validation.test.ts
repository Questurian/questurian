import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadImage } from './browser-image-loader'
import { validateImageResolution } from './image-resolution-validation'

vi.mock('./browser-image-loader', () => ({
  loadImage: vi.fn()
}))

const mockedLoadImage = vi.mocked(loadImage)

describe('image resolution validation', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  function stubObjectUrls() {
    const createObjectURL = vi.fn(() => 'blob:validation')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    return { createObjectURL, revokeObjectURL }
  }

  it('returns source dimensions when the minimum is met', async () => {
    const urls = stubObjectUrls()
    mockedLoadImage.mockResolvedValue({
      naturalWidth: 1600,
      naturalHeight: 1200
    } as HTMLImageElement)

    await expect(
      validateImageResolution(new File(['image'], 'photo.jpg'), 1200, 800)
    ).resolves.toEqual({
      valid: true,
      dimensions: { width: 1600, height: 1200 }
    })
    expect(mockedLoadImage).toHaveBeenCalledWith('blob:validation')
    expect(urls.revokeObjectURL).toHaveBeenCalledWith('blob:validation')
  })

  it('explains which dimensions miss the minimum', async () => {
    stubObjectUrls()
    mockedLoadImage.mockResolvedValue({
      naturalWidth: 800,
      naturalHeight: 600
    } as HTMLImageElement)

    await expect(
      validateImageResolution(new File(['image'], 'photo.jpg'), 1200, 800)
    ).resolves.toEqual({
      valid: false,
      error: 'Image resolution too low. Minimum: 1200×800px, Got: 800×600px',
      dimensions: { width: 800, height: 600 }
    })
  })

  it('revokes the object URL when image loading fails', async () => {
    const urls = stubObjectUrls()
    mockedLoadImage.mockRejectedValue(new Error('Failed to load image'))

    await expect(
      validateImageResolution(new File(['image'], 'photo.jpg'), 1200, 800)
    ).resolves.toEqual({
      valid: false,
      error: 'Failed to load image'
    })
    expect(urls.revokeObjectURL).toHaveBeenCalledWith('blob:validation')
  })
})
