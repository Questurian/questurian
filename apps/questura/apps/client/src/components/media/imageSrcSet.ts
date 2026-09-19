/**
 * Resolution switching for reader-facing photos (issue #563).
 *
 * A MediaSet holds seven *shapes* — square, wide, portrait and so on — and all
 * seven are large; the smallest is 1080px across. A shape is not a size, so a
 * 40x40 thumbnail downloaded a 1080px file and drew 1/1296th of it. The twenty
 * `sizes` values written across the client were inert, because `sizes` without
 * `srcSet` is ignored by the browser.
 *
 * The pipeline now writes small siblings beside every variant file, named
 * `{base}_w{width}.{ext}`. This module derives those names from the one URL a
 * component already has, so no payload, type or API change was needed to reach
 * them.
 *
 * Two rules keep this honest, and both are pinned by `widthLadder.test.mjs`
 * against the server that writes the files:
 *
 *  - Every rung is smaller than the smallest variant, so *every* variant has
 *    *every* rung. A rung the generator skipped would be a broken image here,
 *    not a fallback — `srcSet` has no error recovery.
 *  - The variant's own width comes from its filename suffix. It is the top rung,
 *    so full quality stays reachable; when the suffix is unrecognized we emit
 *    nothing at all rather than guess.
 */

/** Mirrors the server's `WIDTH_LADDER`. Pinned by test. */
export const WIDTH_LADDER = [128, 256, 384, 640, 960]

/** Mirrors the widths in the server's `VARIANT_SPECS`. Pinned by test. */
export const VARIANT_WIDTHS: Record<string, number> = {
  thumbnail: 1200,
  square: 1080,
  wide: 1920,
  portrait: 1200,
  hero: 2100,
  open_graph: 1200,
  editorial: 1600,
}

type ParsedVariantUrl = {
  /** Everything before the extension, including the `_variant` suffix. */
  stem: string
  /** Query string and fragment, preserved so signed URLs survive. */
  suffix: string
  variantWidth: number
}

const parseVariantUrl = (src: string): ParsedVariantUrl | null => {
  if (!src) return null

  const suffixAt = src.search(/[?#]/)
  const path = suffixAt === -1 ? src : src.slice(0, suffixAt)
  const suffix = suffixAt === -1 ? '' : src.slice(suffixAt)

  // The `-2` in `..._thumbnail-2.webp` is Payload deduplicating a filename that
  // was already taken. It is the same shape at the same size -- two thirds of
  // the media zone is named this way -- so it has to be recognized, while
  // genuinely compound names like `_wide-thumbnail` still fall through.
  const match = /^(.*_([a-z_]+)(?:-\d+)?)(\.[A-Za-z0-9]+)$/.exec(path)
  if (!match) return null

  const [, stem, variant] = match
  const variantWidth = VARIANT_WIDTHS[variant]
  if (!variantWidth) return null

  return { stem, suffix, variantWidth }
}

/**
 * Always `.webp`, even when the variant is a .jpeg or .png: the generator
 * encodes every rung as WebP, and Bunny types its responses from the file
 * extension rather than from the Content-Type it was given.
 */
const rungUrl = (parsed: ParsedVariantUrl, width: number): string =>
  `${parsed.stem}_w${width}.webp${parsed.suffix}`

/**
 * `undefined` means "offer the browser nothing to choose from": the URL is not
 * a recognized variant file, so no small siblings were generated for it. Local
 * `/images/...` art and inline body images land here and keep working exactly
 * as before.
 */
export const buildSrcSet = (src: string): string | undefined => {
  const parsed = parseVariantUrl(src)
  if (!parsed) return undefined

  const rungs = WIDTH_LADDER.filter((width) => width < parsed.variantWidth).map(
    (width) => `${rungUrl(parsed, width)} ${width}w`,
  )
  if (rungs.length === 0) return undefined

  return [...rungs, `${src} ${parsed.variantWidth}w`].join(', ')
}
