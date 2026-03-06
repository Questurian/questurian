const MAX_OG_SOCIAL_IMAGE_FILE_SIZE = 10 * 1024 * 1024

export const OG_SOCIAL_IMAGE_WIDTH = 1200
export const OG_SOCIAL_IMAGE_HEIGHT = 630

const SUPPORTED_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])

export function validateOgSocialImageFile(file: File): string | null {
  if (!SUPPORTED_MIME_TYPES.has(file.type)) {
    return 'Upload a JPG, PNG, or WebP image for og:image.'
  }

  if (file.size > MAX_OG_SOCIAL_IMAGE_FILE_SIZE) {
    return 'OG image file is too large. Maximum size is 10MB.'
  }

  return null
}
