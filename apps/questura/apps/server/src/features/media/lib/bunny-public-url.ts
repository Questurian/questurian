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
 * The readiness sandbox's fixture media server (`scripts/readiness/media-server.ts`),
 * or nothing (launch fix plan item 8).
 *
 * The sandbox has no pull zone, so its image addresses used to resolve
 * nowhere (`https://readiness-media.invalid/media/…`) and every image a
 * browser journey loaded was broken. With `READINESS_SANDBOX=1` and
 * `READINESS_MEDIA_ORIGIN` set, the same path is served from that origin
 * instead. Honoured only for plain http on this machine (`127.0.0.1` or a
 * `*.localhost` name, with a port), like the Stripe stub: a stray variable in
 * a real deployment can only point images at the reader's own loopback, and
 * `env:check` refuses both names on Railway.
 */
export const sandboxMediaOrigin = (
  env: Record<string, string | undefined> = process.env,
): string | null => {
  if (env.READINESS_SANDBOX !== '1') return null
  const raw = env.READINESS_MEDIA_ORIGIN?.trim()
  if (!raw) return null
  const url = new URL(raw)
  const loopback = url.hostname === '127.0.0.1' || url.hostname.endsWith('.localhost')
  if (!loopback || url.protocol !== 'http:' || !url.port || url.pathname !== '/') {
    throw new Error('READINESS_MEDIA_ORIGIN must be http://127.0.0.1:<port> or http://<name>.localhost:<port>.')
  }
  return url.origin
}

/**
 * The storage adapter's own address for a file, moved to the sandbox's media
 * server when there is one (`payload.config.ts` hands this to the adapter's
 * `urlTransform`). Everywhere else it is returned unchanged.
 */
export const sandboxMediaUrl = (url: string): string => {
  const origin = sandboxMediaOrigin()
  if (!origin) return url
  const parsed = new URL(url)
  return `${origin}${parsed.pathname}${parsed.search}`
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
  return `${sandboxMediaOrigin() ?? `https://${host}`}/${encodeURI(path)}`
}
