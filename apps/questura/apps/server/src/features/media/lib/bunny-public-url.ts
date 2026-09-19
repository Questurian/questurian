/**
 * The one definition of a public media URL.
 *
 * Every media file has exactly one reader-facing address: the Bunny pull zone,
 * `https://{BUNNY_STORAGE_HOSTNAME}/{prefix}/{filename}`. Three places used to
 * spell that out independently -- the `bunny_original_url` hook, the public
 * image resolver's filename fallback, and the variant regenerator -- and a
 * fourth spelling lives inside `@seshuk/payload-storage-bunny`, which is what
 * actually writes `url` on every read once `disablePayloadAccessControl` is on.
 *
 * `buildPublicMediaUrl` is deliberately byte-identical to the adapter's
 * `generateURL` (`dist/handlers/generateURL.js`):
 *
 *   `https://${storageConfig.hostname}/${encodeURI(posix.join(prefix, filename))}`
 *
 * so a URL this module produces and a URL Payload stores are the same string.
 * `encodeURI`, not `encodeURIComponent`: the adapter uses `encodeURI`, and the
 * difference only shows up on `#`, `?` and `&`, which no filename in the zone
 * contains. The join is written out rather than imported from `node:path`:
 * this module is reached from Payload admin cells, which webpack bundles for
 * the browser, where a `node:` import fails the build outright.
 *
 * The hostname itself is never written down in source. It is configuration --
 * `BUNNY_STORAGE_HOSTNAME`, which the storage plugin already requires -- and
 * the pull zone (`questurian-cdn.b-cdn.net`), not the storage API.
 */

/**
 * The `prefix` every media-assets file is stored under. Shared with the plugin
 * config so the two cannot drift; all 18,654 rows carry it, none are null.
 */
export const MEDIA_ASSETS_PREFIX = 'media'

const normalizeHost = (hostname: string): string =>
  hostname.replace(/^https?:\/\//, '').replace(/\/+$/, '')

const normalizePathPart = (value: string): string => value.replace(/^\/+/, '').replace(/\/+$/, '')

/** The configured pull-zone host, or `null` when storage is not configured. */
export const bunnyPublicHost = (): string | null => {
  const hostname = process.env.BUNNY_STORAGE_HOSTNAME
  if (!hostname) return null

  const normalized = normalizeHost(hostname)
  return normalized ? normalized : null
}

/**
 * `null` when storage is unconfigured or the filename is empty -- callers turn
 * that into "no image" rather than into a URL that resolves nowhere.
 */
export const buildPublicMediaUrl = (
  filename: string | null | undefined,
  prefix: string | null | undefined = MEDIA_ASSETS_PREFIX,
): string | null => {
  const host = bunnyPublicHost()
  if (!host) return null

  const file = typeof filename === 'string' ? normalizePathPart(filename) : ''
  if (!file) return null

  const dir = typeof prefix === 'string' ? normalizePathPart(prefix) : ''
  const path = dir ? `${dir}/${file}` : file
  return `https://${host}/${encodeURI(path)}`
}
