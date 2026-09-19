import { buildPublicMediaUrl } from './bunny-public-url'

const OG_IMAGE_WIDTH = 1200
const OG_IMAGE_HEIGHT = 630

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

/**
 * `bunny_original_url` is the older of the two fields that hold a file's public
 * address, kept only for OG-sized assets. It now builds that address with the
 * same function the resolver and the regenerator use, so the two fields hold
 * the same string for the same file instead of two spellings of it.
 */
export const getExpectedBunnyOriginalUrl = (doc: Record<string, unknown>): string | null => {
  const width = toNumber(doc.width)
  const height = toNumber(doc.height)
  const filename = typeof doc.filename === 'string' ? doc.filename : null
  const prefix = typeof doc.prefix === 'string' ? doc.prefix : null

  if (width !== OG_IMAGE_WIDTH || height !== OG_IMAGE_HEIGHT) return null

  return buildPublicMediaUrl(filename, prefix)
}
