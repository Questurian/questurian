/**
 * Where an in-article ad is allowed to sit.
 *
 * Ad slots are *derived*, never authored. There is deliberately no
 * `blockType: 'ad'`: the writing pipeline would then own commercial density, an
 * authored slot could land exactly on the paywall seam, and any body edit would
 * shift the rhythm silently.
 *
 * The unit of placement is not the block. A standard article's prose arrives as
 * a single `text` block holding the whole body as HTML, so a block-level plan
 * has nowhere to put anything -- the real boundaries are the section headings
 * inside that HTML. This module therefore splits the prose and plans over the
 * flattened stream of prose segments and non-text blocks together, so one word
 * budget covers the whole article.
 *
 * Every slot on a standard article is a thin `banner`. The first sits just
 * after the opening paragraph -- the only one every reader sees, because it is
 * the only one above the fold on a phone -- and the rest recur at section
 * breaks. Thin is what buys the frequency: a bar is crossed, a block is met,
 * and a reading column interrupted by blocks stops being a reading column.
 * `rectangle` belongs to the listicles (see `listicleAdPlacement`), where the
 * page is already a stack of units rather than prose.
 *
 * The policy in one sentence: an ad may only follow prose, may only introduce a
 * new section or a photo, and never sits near an edge the reader is already
 * negotiating -- above the first paragraph, under a heading, at the paywall
 * seam, or in the tail where Trending and Partners already close the page.
 *
 * Dependency-free on purpose: `pnpm test` runs this through
 * `node --experimental-strip-types`, so no `@/` alias imports here.
 */

/** The shape this planner needs. `ContentBlock` structurally satisfies it. */
export type PlannableBlock = { blockType: string; content?: string }

/** A thin leaderboard, or the deeper in-column rectangle. */
export type AdVariant = 'banner' | 'rectangle'

export type ProseSegment = {
  html: string
  words: number
  tag: string | null
  heading: boolean
  /** A section break an ad may be placed in front of. */
  anchor: boolean
}

/**
 * What may sit directly below an ad, block-wise.
 *
 * Every other block opens with its own rule, label or tinted ground
 * (`EditorialLabelRule`, the pull quote's double rule, the `in-the-know` wash).
 * Stacking one under the ad's closing hairline is visual mush and steals the
 * block's opening beat.
 */
const BODY_BELOW = new Set(['image', 'img-pair', 'img-trio'])

/**
 * Headings an ad may be placed in front of.
 *
 * `h2`/`h3` are sections; `h4` is a sub-item (one hotel, one street) and
 * splitting one off its section breaks a tight run. The ad goes *before* the
 * heading, never after it -- an ad between a heading and its first paragraph is
 * the oldest trick in the book for making a unit read as the section's content.
 */
const ANCHOR_HEADINGS = new Set(['h2', 'h3'])

const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
const VOID_TAGS = new Set(['img', 'br', 'hr', 'input', 'source', 'wbr'])

/** Words the reader must clear before the first rectangle. */
const MIN_WORDS_BEFORE_FIRST = 300

/**
 * Words between one bar and the next.
 *
 * Tighter than a rectangle cadence would allow, because every slot on a
 * standard article is thin: a 50px bar is crossed, not met, so it can recur at
 * a rate a 250px block never could.
 */
const MIN_WORDS_BETWEEN = 250

/** Words that must still follow an ad, so it never lands in the tail. */
const MIN_WORDS_AFTER = 200

/**
 * Words the opening paragraph must carry before the banner may follow it.
 *
 * The reader has to have started reading. A banner after a one-line lede is an
 * ad above the article wearing a paragraph as a hat.
 */
const MIN_WORDS_BEFORE_BANNER = 40

/**
 * How far in the banner may still be placed.
 *
 * Past this it is no longer the slot every reader sees, which is its only
 * reason to exist -- the section-break rectangles cover the rest of the body.
 */
const MAX_WORDS_BEFORE_BANNER = 400

/**
 * Words that must follow the banner.
 *
 * Lower than `MIN_WORDS_AFTER`: the banner's job is to be crossed early, so the
 * guard only has to prove the article actually continues past it. The tail it
 * must stay out of is a long way further down.
 */
const MIN_WORDS_AFTER_BANNER = 120

/** An article shorter than this gets the opening bar and nothing else. */
const MIN_WORDS_FOR_MORE = 450

/** Ceiling on bars per article, however long it runs. */
const MAX_SLOTS = 8

function countWords(html: string): number {
  const text = html.replace(/<[^>]*>/g, ' ').trim()
  if (!text) return 0
  return text.split(/\s+/).length
}

/**
 * Splits a prose block into its top-level elements.
 *
 * Hand-rolled rather than regex-per-element so a nested `<ul>` or a `<p>`
 * inside a blockquote can never be mistaken for a top-level boundary -- an ad
 * spliced into the middle of a list is exactly the failure this avoids.
 */
export function splitProse(html: string): ProseSegment[] {
  const segments: ProseSegment[] = []
  const push = (chunk: string, tag: string | null) => {
    if (!chunk.trim()) return
    segments.push({
      html: chunk,
      words: countWords(chunk),
      tag,
      heading: tag !== null && HEADINGS.has(tag),
      anchor: tag !== null && ANCHOR_HEADINGS.has(tag),
    })
  }

  let cursor = 0
  while (cursor < html.length) {
    const open = html.indexOf('<', cursor)
    if (open === -1) {
      push(html.slice(cursor), null)
      break
    }
    if (open > cursor) push(html.slice(cursor, open), null)

    const openEnd = html.indexOf('>', open)
    if (openEnd === -1) {
      push(html.slice(open), null)
      break
    }

    const named = /^<\s*([a-zA-Z][a-zA-Z0-9]*)/.exec(html.slice(open, openEnd + 1))
    if (!named) {
      cursor = openEnd + 1
      continue
    }

    const tag = named[1].toLowerCase()
    if (VOID_TAGS.has(tag) || html[openEnd - 1] === '/') {
      push(html.slice(open, openEnd + 1), tag)
      cursor = openEnd + 1
      continue
    }

    // Walk same-tag opens and closes until the depth returns to zero.
    const pairs = new RegExp(`<\\s*(/?)${tag}(?=[\\s/>])`, 'gi')
    pairs.lastIndex = openEnd + 1
    let depth = 1
    let end = html.length
    let match: RegExpExecArray | null
    while ((match = pairs.exec(html)) !== null) {
      depth += match[1] === '/' ? -1 : 1
      if (depth === 0) {
        const closeEnd = html.indexOf('>', match.index)
        end = closeEnd === -1 ? html.length : closeEnd + 1
        break
      }
    }

    push(html.slice(open, end), tag)
    cursor = end
  }

  return segments
}

type Unit = {
  blockIndex: number
  /** Null for a non-text block. */
  segIndex: number | null
  words: number
  /** Prose can be followed by an ad; a block cannot. */
  prose: boolean
  heading: boolean
  /** This unit may have an ad placed in front of it. */
  anchor: boolean
}

export type AdPlan = {
  /**
   * Prose runs for a text block, when an ad splits it. Consecutive runs are
   * rendered with one ad between them. Absent means "render the block whole".
   */
  proseRuns: Map<number, string[]>
  /** Variant of the ad after each run but the last, parallel to `proseRuns`. */
  proseAds: Map<number, AdVariant[]>
  /** Block indices to render an ad after, and which variant. */
  afterBlock: Map<number, AdVariant>
  /** How many slots the plan actually placed. */
  count: number
}

export type AdPlanOptions = {
  /**
   * Master switch. Set false to suppress in-article ads entirely -- the hook
   * for "membership is the ad-free tier" once the client knows who is reading.
   */
  enabled?: boolean
  /** Set false to drop the thin opening banner and keep only the rectangles. */
  banner?: boolean
  /**
   * The block index the paywall cut the body at (`gate.shown`), or null when
   * nothing is withheld. Ads stay clear of both sides of that seam.
   */
  gateAt?: number | null
}

/**
 * How many bars past the opening one a body of this length can carry.
 *
 * Roughly one per 300 words. `MIN_WORDS_BETWEEN` is what actually spaces them;
 * this only sets the ceiling, and a body with few section breaks will come in
 * under it because there is nowhere legal to put the rest.
 */
function slotBudget(words: number): number {
  if (words < MIN_WORDS_FOR_MORE) return 0
  return Math.min(MAX_SLOTS - 1, Math.round(words / 300))
}

/**
 * Plans the ad slots for an article body.
 *
 * Plan over the article's *full* block list on both sides of the paywall: the
 * sample the server renders is a prefix of the full list, so the same call
 * produces the same word counters either side and the two halves cannot
 * double-place or drop a slot.
 */
export function planArticleAds(
  blocks: PlannableBlock[],
  options: AdPlanOptions = {},
): AdPlan {
  const { enabled = true, banner = true, gateAt = null } = options
  const plan: AdPlan = {
    proseRuns: new Map(),
    proseAds: new Map(),
    afterBlock: new Map(),
    count: 0,
  }
  if (!enabled || blocks.length === 0) return plan

  const units: Unit[] = []
  const segmentsByBlock = new Map<number, ProseSegment[]>()

  blocks.forEach((block, blockIndex) => {
    if (block.blockType === 'text' && typeof block.content === 'string') {
      const segments = splitProse(block.content)
      segmentsByBlock.set(blockIndex, segments)
      segments.forEach((segment, segIndex) => {
        units.push({
          blockIndex,
          segIndex,
          words: segment.words,
          prose: true,
          heading: segment.heading,
          anchor: segment.anchor,
        })
      })
      return
    }
    units.push({
      blockIndex,
      segIndex: null,
      words: 0,
      prose: false,
      heading: false,
      anchor: BODY_BELOW.has(block.blockType),
    })
  })

  const totalWords = units.reduce((sum, unit) => sum + unit.words, 0)
  if (units.length < 2) return plan

  /** The seam sits between blocks gateAt - 1 and gateAt. An ad on the last
   *  boundary before it is the last thing the free reader sees, and one on the
   *  first boundary after it is the first thing an unlock buys. */
  const onGateSeam = (k: number) => {
    if (gateAt === null) return false
    const unit = units[k]
    const next = units[k + 1]
    const closesSample = unit.blockIndex === gateAt - 1 && next.blockIndex === gateAt
    const opensRemainder =
      unit.blockIndex === gateAt && next.blockIndex === gateAt && unit.segIndex === 0
    return closesSample || opensRemainder
  }

  const wordsAfter = (k: number) => {
    let rest = 0
    for (let i = k + 1; i < units.length; i += 1) rest += units[i].words
    return rest
  }

  /**
   * The one slot above the fold: after the opening paragraph, before the body
   * gets going. Not an anchor boundary -- by definition nothing has broken yet
   * this early -- so it has its own rule.
   *
   * The single hard prohibition is that it must *follow* prose, never a
   * heading: an ad between a heading and that section's first paragraph is what
   * makes the unit read as the section's content. Sitting in front of a heading
   * is fine, and has to be, because plenty of bodies alternate heading and
   * paragraph too tightly to offer any other boundary this high up.
   *
   * Every other disqualifier keeps scanning rather than giving up -- an
   * unusable first candidate is not evidence the article has no usable one --
   * until the reader is far enough in that the slot would no longer be the one
   * every reader sees, which is its whole reason to exist.
   */
  const findBannerBoundary = (): number => {
    let words = 0
    for (let k = 0; k < units.length - 1; k += 1) {
      const unit = units[k]
      const next = units[k + 1]
      words += unit.words
      if (words > MAX_WORDS_BEFORE_BANNER) return -1
      if (!unit.prose || unit.heading) continue
      if (words < MIN_WORDS_BEFORE_BANNER) continue
      if (!next.prose && !next.anchor) continue
      if (onGateSeam(k)) continue
      if (wordsAfter(k) < MIN_WORDS_AFTER_BANNER) continue
      return k
    }
    return -1
  }

  const slots = new Map<number, AdVariant>()
  const bannerAt = banner ? findBannerBoundary() : -1
  if (bannerAt !== -1) {
    slots.set(bannerAt, 'banner')
    plan.count += 1
  }

  let budget = slotBudget(totalWords)
  let wordsBefore = 0
  let wordsSinceAd = 0
  let placedAny = bannerAt !== -1

  for (let k = 0; k < units.length - 1 && budget > 0; k += 1) {
    const unit = units[k]
    const next = units[k + 1]
    wordsBefore += unit.words
    wordsSinceAd += unit.words
    if (k === bannerAt) wordsSinceAd = 0

    // A deep bar only ever follows prose, and only ever introduces a new
    // section or a photo.
    if (!unit.prose || !next.anchor || slots.has(k)) continue

    const spaced = placedAny
      ? wordsSinceAd >= MIN_WORDS_BETWEEN
      : wordsBefore >= MIN_WORDS_BEFORE_FIRST
    if (!spaced) continue

    if (totalWords - wordsBefore < MIN_WORDS_AFTER) break
    if (onGateSeam(k)) continue

    slots.set(k, 'banner')
    plan.count += 1
    placedAny = true
    wordsSinceAd = 0
    budget -= 1
  }

  // Materialise: boundaries inside a text block split its prose into runs,
  // boundaries between blocks become an ad after the block.
  const splitsByBlock = new Map<number, Array<{ at: number; variant: AdVariant }>>()
  for (const [k, variant] of [...slots].sort((a, b) => a[0] - b[0])) {
    const unit = units[k]
    const next = units[k + 1]
    if (next.blockIndex === unit.blockIndex && next.segIndex !== null) {
      const at = splitsByBlock.get(unit.blockIndex) ?? []
      at.push({ at: next.segIndex, variant })
      splitsByBlock.set(unit.blockIndex, at)
    } else {
      plan.afterBlock.set(unit.blockIndex, variant)
    }
  }

  for (const [blockIndex, cuts] of splitsByBlock) {
    const segments = segmentsByBlock.get(blockIndex)
    if (!segments) continue
    const runs: string[] = []
    let start = 0
    for (const cut of cuts) {
      runs.push(segments.slice(start, cut.at).map((s) => s.html).join(''))
      start = cut.at
    }
    runs.push(segments.slice(start).map((s) => s.html).join(''))
    plan.proseRuns.set(blockIndex, runs)
    plan.proseAds.set(blockIndex, cuts.map((cut) => cut.variant))
  }

  return plan
}
