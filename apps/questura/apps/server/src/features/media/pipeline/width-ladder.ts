/**
 * The width ladder (issue #563).
 *
 * `VARIANT_SPECS` describes seven *shapes* — square, wide, portrait and so on —
 * and every one of them is large. The smallest is 1080px across. A 40x40
 * thumbnail therefore downloaded a 1080px file and drew 1/1296th of it, because
 * a shape is not a size and nothing below 1080 existed anywhere in the system.
 *
 * This adds sizes. Each variant file gains small siblings named by one rule, so
 * the browser can be offered a ladder and pick the rung it will actually draw.
 *
 * The rule is deliberately unconditional: every rung is smaller than the
 * smallest variant (1080), so *every* variant gets *all* rungs. That matters
 * more than it looks. The reader-facing client derives these same names from a
 * URL, and a rung it asks for that was never generated is a broken image, not a
 * fallback. Keeping the rule free of per-variant conditions is what lets both
 * sides agree without a manifest to consult.
 */

import { VARIANT_SPECS } from './variant-specs'

export const WIDTH_LADDER = [128, 256, 384, 640, 960] as const

/**
 * Every rung must stay below the smallest variant, or that variant would be
 * asked for an upscale of itself. Asserted rather than commented because the
 * client mirrors this ladder and cannot see this file at runtime.
 */
export const SMALLEST_VARIANT_WIDTH = Math.min(
  ...Object.values(VARIANT_SPECS).map((spec) => spec.width),
)

/**
 * Rungs are always WebP, whatever the variant they came from, so the name says
 * `.webp` even when the original is a .jpeg or .png. That is not cosmetic:
 * Bunny types a response from the file extension and ignores the Content-Type
 * given on upload, so a WebP body under a `.jpeg` name is served as
 * `content-type: image/jpeg`.
 */
export const ladderFilename = (filename: string, width: number): string => {
  const extensionAt = filename.lastIndexOf('.')
  const base = extensionAt <= 0 ? filename : filename.slice(0, extensionAt)
  return `${base}_w${width}.webp`
}

/** True for a name this module produced, so a ladder file never grows a ladder of its own. */
export const isLadderFilename = (filename: string): boolean =>
  /_w\d+(\.[A-Za-z0-9]+)?$/.test(filename)
