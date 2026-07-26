import type { ImageVariantType } from './image-variant-policy'

function withoutExtension(filename: string): string {
  return filename.replace(/\.[^.]+$/, '')
}

function withoutFileExtension(filename: string): string {
  return filename.replace(/\.[^/.]+$/, '')
}

function sanitizeFileNameBase(value: string): string {
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  return normalized || 'image'
}

export function generateVariantFileName(
  originalName: string,
  variantType: ImageVariantType,
  fileNamePrefix?: string
): string {
  const sourceBaseName = fileNamePrefix?.trim()
    ? fileNamePrefix
    : withoutFileExtension(originalName)

  return `${sanitizeFileNameBase(sourceBaseName)}_${variantType}.webp`
}

/**
 * Parse photographer credit from: author_series-slug-number.ext
 */
export function parsePhotographerFromFilename(filename: string): string | null {
  const base = withoutExtension(filename)
  if (!base.includes('_')) return null

  const authorSlug = base.split('_')[0]
  if (!authorSlug) return null

  return authorSlug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

/**
 * Parse the series slug from: author_series-slug-number.ext
 */
export function parseSeriesSlugFromFilename(filename: string): string | null {
  const base = withoutExtension(filename)
  if (!base.includes('_')) return null

  const seriesPart = base.split('_')[1]
  if (!seriesPart) return null

  const parts = seriesPart.split('-')
  const sequenceNumber = parts[parts.length - 1]
  if (!/^\d+$/.test(sequenceNumber)) return null

  return parts.slice(0, -1).join('-')
}
