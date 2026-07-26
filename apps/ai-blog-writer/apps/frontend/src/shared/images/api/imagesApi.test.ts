import { describe, expect, it } from 'vitest'
import * as altTextApi from './alt-text/alt-text.api'
import * as analysisPromptsApi from './analysis-prompts/image-analysis-prompts.api'
import * as fluxEditingApi from './flux/flux-editing.api'
import * as imagesApi from './imagesApi'
import * as imageProcessingApi from './processing/image-processing.api'
import * as socialImagesApi from './social/social-images.api'
import * as imageUploadsApi from './uploads/image-uploads.api'

describe('imagesApi compatibility barrel', () => {
  it('re-exports every concern-specific runtime API', () => {
    expect(imagesApi.generateAltText).toBe(altTextApi.generateAltText)
    expect(imagesApi.describeImageScene).toBe(
      analysisPromptsApi.describeImageScene
    )
    expect(imagesApi.buildImageEditPrompt).toBe(
      analysisPromptsApi.buildImageEditPrompt
    )
    expect(imagesApi.describeImageSubject).toBe(
      analysisPromptsApi.describeImageSubject
    )
    expect(imagesApi.buildImageInsertPrompt).toBe(
      analysisPromptsApi.buildImageInsertPrompt
    )
    expect(imagesApi.generateFluxEditedImage).toBe(
      fluxEditingApi.generateFluxEditedImage
    )
    expect(imagesApi.processImageOnly).toBe(imageProcessingApi.processImageOnly)
    expect(imagesApi.generateSocialImageFromFeatured).toBe(
      socialImagesApi.generateSocialImageFromFeatured
    )
    expect(imagesApi.uploadSocialImage).toBe(socialImagesApi.uploadSocialImage)
    expect(imagesApi.uploadImage).toBe(imageUploadsApi.uploadImage)
    expect(imagesApi.uploadImageVariants).toBe(
      imageUploadsApi.uploadImageVariants
    )
  })
})
