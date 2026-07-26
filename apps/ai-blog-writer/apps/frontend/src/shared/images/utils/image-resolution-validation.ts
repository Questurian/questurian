import { loadImage } from './browser-image-loader'

export interface ImageResolutionValidation {
  valid: boolean
  error?: string
  dimensions?: { width: number; height: number }
}

export async function validateImageResolution(
  file: File,
  minWidth: number,
  minHeight: number
): Promise<ImageResolutionValidation> {
  try {
    const url = URL.createObjectURL(file)

    try {
      const image = await loadImage(url)
      const dimensions = {
        width: image.naturalWidth,
        height: image.naturalHeight
      }

      if (image.naturalWidth < minWidth || image.naturalHeight < minHeight) {
        return {
          valid: false,
          error: `Image resolution too low. Minimum: ${minWidth}×${minHeight}px, Got: ${image.naturalWidth}×${image.naturalHeight}px`,
          dimensions
        }
      }

      return { valid: true, dimensions }
    } finally {
      URL.revokeObjectURL(url)
    }
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Failed to validate image'
    }
  }
}
