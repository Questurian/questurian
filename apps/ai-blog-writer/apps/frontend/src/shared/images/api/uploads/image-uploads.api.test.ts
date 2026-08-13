import { beforeEach, describe, expect, it, vi } from 'vitest'
import { uploadImage, uploadImageVariants } from './image-uploads.api'
import { uploadSingleApi } from './upload-single.api'
import { uploadVariantsApi } from './upload-variants.api'

vi.mock('./upload-single.api', () => ({
  uploadSingleApi: vi.fn()
}))

vi.mock('./upload-variants.api', () => ({
  uploadVariantsApi: vi.fn()
}))

describe('image upload public API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('maps the positional variant upload contract and returns the response', async () => {
    const variantFiles = [
      {
        type: 'wide' as const,
        file: new File(['wide'], 'wide.webp', { type: 'image/webp' })
      }
    ]
    const onProgress = vi.fn()
    const response = {
      success: true,
      mediaSetId: '42',
      externalRef: 'featured-upload',
      variants: {}
    }
    vi.mocked(uploadVariantsApi).mockResolvedValue(response)

    await expect(
      uploadImageVariants(
        variantFiles,
        'featured-upload',
        'A waterfront skyline',
        undefined,
        'Photographer',
        onProgress,
        [3, 5]
      )
    ).resolves.toBe(response)

    expect(uploadVariantsApi).toHaveBeenCalledWith({
      variantFiles,
      externalRef: 'featured-upload',
      altText: 'A waterfront skyline',
      locationRef: undefined,
      photographerCredit: 'Photographer',
      onProgress,
      tags: [3, 5]
    })
  })

  it('maps the positional single-image upload contract', async () => {
    const file = new File(['image'], 'image.webp', { type: 'image/webp' })
    const onProgress = vi.fn()
    const response = {
      success: true,
      mediaSetId: '7',
      externalRef: 'original-upload',
      variants: {}
    }
    vi.mocked(uploadSingleApi).mockResolvedValue(response)

    await expect(
      uploadImage(
        file,
        'original-upload',
        'A mountain trail',
        12,
        'Photographer',
        onProgress
      )
    ).resolves.toBe(response)

    expect(uploadSingleApi).toHaveBeenCalledWith({
      file,
      externalRef: 'original-upload',
      altText: 'A mountain trail',
      locationRef: 12,
      photographerCredit: 'Photographer',
      onProgress
    })
  })
})
