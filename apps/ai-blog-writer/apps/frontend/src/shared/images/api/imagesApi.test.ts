import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fluxEditApi } from './flux-edit.api'
import { generateSocialImageApi } from './generate-social-image.api'
import {
  generateFluxEditedImage,
  generateSocialImageFromFeatured,
  uploadImageVariants
} from './imagesApi'
import { uploadVariantsApi } from './uploads/upload-variants.api'

vi.mock('./flux-edit.api', () => ({
  fluxEditApi: vi.fn()
}))

vi.mock('./generate-social-image.api', () => ({
  generateSocialImageApi: vi.fn()
}))

vi.mock('./uploads/upload-variants.api', () => ({
  uploadVariantsApi: vi.fn()
}))

describe('imagesApi compatibility facade', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('maps the positional variant upload contract to the focused upload API', async () => {
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
        'token',
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
      token: 'token',
      photographerCredit: 'Photographer',
      onProgress,
      tags: [3, 5]
    })
  })

  it('preserves the featured MediaSet discriminator for social generation', async () => {
    const response = {
      success: true,
      featuredAssetId: null,
      mediaSetId: '17',
      sourceAssetId: '21',
      generatedAssetId: '22',
      generatedImageUrl: 'https://images.example/social.webp',
      width: 1200,
      height: 630
    }
    vi.mocked(generateSocialImageApi).mockResolvedValue(response)

    await expect(
      generateSocialImageFromFeatured({ featuredMediaSetId: 17 }, 'token')
    ).resolves.toBe(response)

    expect(generateSocialImageApi).toHaveBeenCalledWith({
      featuredMediaSetId: 17,
      token: 'token'
    })
  })

  it('forwards optional FLUX settings without changing the public signature', async () => {
    const referenceImage = new File(['reference'], 'reference.png', {
      type: 'image/png'
    })
    const additionalReferenceImage = new File(
      ['additional'],
      'additional.png',
      {
        type: 'image/png'
      }
    )
    const response = {
      blob: new Blob(['generated'], { type: 'image/png' }),
      fileName: 'generated.png',
      contentType: 'image/png',
      requestId: 'request-1',
      model: 'flux-2-pro',
      cost: 0.1,
      inputMegapixels: 1,
      outputMegapixels: 1
    }
    vi.mocked(fluxEditApi).mockResolvedValue(response)

    await expect(
      generateFluxEditedImage('Recreate this scene', referenceImage, 'token', {
        additionalReferenceImages: [additionalReferenceImage],
        modelId: 'flux-2-pro',
        width: 1200,
        height: 630,
        safetyTolerance: 2,
        promptUpsampling: true,
        seed: '1234'
      })
    ).resolves.toBe(response)

    expect(fluxEditApi).toHaveBeenCalledWith({
      prompt: 'Recreate this scene',
      referenceImage,
      token: 'token',
      additionalReferenceImages: [additionalReferenceImage],
      modelId: 'flux-2-pro',
      width: 1200,
      height: 630,
      safetyTolerance: 2,
      promptUpsampling: true,
      seed: '1234'
    })
  })
})
