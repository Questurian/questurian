import type { CropStates, ImageVariantType } from '../../utils/imageProcessing'

export function formatVariantLabel(variantType: ImageVariantType): string {
  return variantType
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function isVariantCropSaved(
  cropStates: CropStates,
  variantType: ImageVariantType,
): boolean {
  const state = cropStates[variantType]
  return Boolean(
    state.completed &&
      state.croppedAreaPixels &&
      state.croppedAreaPixels.width > 0,
  )
}
