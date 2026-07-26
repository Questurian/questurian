import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateSocialImageApi } from '../generate-social-image.api'
import { uploadSocialImageApi } from '../upload-social-image.api'
import {
  generateSocialImageFromFeatured,
  uploadSocialImage
} from './social-images.api'

vi.mock('../generate-social-image.api', () => ({
  generateSocialImageApi: vi.fn()
}))

vi.mock('../upload-social-image.api', () => ({
  uploadSocialImageApi: vi.fn()
}))

describe('social image public API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('preserves the featured MediaSet discriminator', async () => {
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

  it('maps the positional social upload contract', async () => {
    const file = new File(['social'], 'social.webp')
    const response = {
      success: true,
      mediaSetId: '17',
      externalRef: 'social-upload',
      generatedAssetId: '22',
      generatedImageUrl: 'https://images.example/social.webp',
      width: 1200,
      height: 630
    }
    vi.mocked(uploadSocialImageApi).mockResolvedValue(response)

    await expect(
      uploadSocialImage(file, 'Social preview', 3, 'token', 'Photographer')
    ).resolves.toBe(response)
    expect(uploadSocialImageApi).toHaveBeenCalledWith({
      file,
      altText: 'Social preview',
      locationRef: 3,
      token: 'token',
      photographerCredit: 'Photographer'
    })
  })
})
