/**
 * Compatibility surface for existing image-processing consumers.
 *
 * New code should import the responsibility-specific module it needs.
 */
export { loadImage } from './browser-image-loader'
export {
  calculateDefaultCrop,
  initializeCropStates,
  type CropData,
  type CropState,
  type CropStates
} from './image-crop-state'
export {
  createCroppedImage,
  createMultiVariantImages
} from './image-crop-generator'
export {
  parsePhotographerFromFilename,
  parseSeriesSlugFromFilename
} from './image-filename-metadata'
export {
  validateImageResolution,
  type ImageResolutionValidation
} from './image-resolution-validation'
export {
  VARIANT_SEQUENCE,
  VARIANT_SPECS,
  type ImageVariantType,
  type VariantSpec
} from './image-variant-policy'
