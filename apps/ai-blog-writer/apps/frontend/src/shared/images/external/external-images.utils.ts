import type { ExternalImageProvider } from './external-images.types'

export function parseFileNameFromContentDisposition(
  contentDisposition: string | null,
): string | null {
  if (!contentDisposition) return null
  const match = contentDisposition.match(/filename="([^"]+)"/i)
  if (!match?.[1]) return null
  return match[1].trim() || null
}

export function buildExternalFallbackFileName(
  provider: ExternalImageProvider,
  photoId?: string | number,
): string {
  const token = String(photoId ?? '').trim()
  const normalizedToken = token.replace(/[^a-zA-Z0-9_-]+/g, '-') || 'image'
  return `${provider}-${normalizedToken}.jpg`
}
