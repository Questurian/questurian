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

const normalizeHostname = (hostname: string): string =>
  hostname.replace(/^https?:\/\//, '').replace(/\/+$/, '')

const normalizePathPart = (value: string): string => value.replace(/^\/+/, '').replace(/\/+$/, '')

const buildBunnyStorageUrl = (
  hostname: string,
  prefix: string | null | undefined,
  filename: string,
): string | null => {
  const normalizedHost = normalizeHostname(hostname)
  if (!normalizedHost) return null

  const pathParts = [
    ...(prefix ? [normalizePathPart(prefix)] : []),
    normalizePathPart(filename),
  ].filter(Boolean)

  if (pathParts.length === 0) return null

  const encodedPath = encodeURI(pathParts.join('/'))
  return `https://${normalizedHost}/${encodedPath}`
}

export const getExpectedBunnyOriginalUrl = (doc: Record<string, unknown>): string | null => {
  const width = toNumber(doc.width)
  const height = toNumber(doc.height)
  const filename = typeof doc.filename === 'string' ? doc.filename : null
  const prefix = typeof doc.prefix === 'string' ? doc.prefix : null
  const hostname = process.env.BUNNY_STORAGE_HOSTNAME

  if (width !== OG_IMAGE_WIDTH || height !== OG_IMAGE_HEIGHT) return null
  if (!filename || !hostname) return null

  return buildBunnyStorageUrl(hostname, prefix, filename)
}
