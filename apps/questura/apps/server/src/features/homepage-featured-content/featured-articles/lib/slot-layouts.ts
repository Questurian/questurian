import {
  FEATURED_ARTICLES_SLOT3_LAYOUT_VALUES,
  FEATURED_ARTICLES_SLOT4_LAYOUT_VALUES,
  FEATURED_ARTICLES_SLOT5_LAYOUT_VALUES,
  type FeaturedArticlesSlot3Layout,
  type FeaturedArticlesSlot4Layout,
  type FeaturedArticlesSlot5Layout,
} from '../constants'

export function normalizeFeaturedArticlesSlot3Layout(raw: unknown): FeaturedArticlesSlot3Layout {
  if (raw === 'featured-center' || raw === 'hero-left') return raw
  return 'hero-left'
}

export function publicFeaturedArticlesSlot3Layout(
  block: { slot3Layout?: unknown },
  totalSlots: number,
): FeaturedArticlesSlot3Layout | null {
  if (totalSlots !== 3) return null
  return normalizeFeaturedArticlesSlot3Layout(block.slot3Layout)
}

type Slot3LayoutParseResult =
  | { ok: true; omit: true }
  | { ok: true; omit: false; value: FeaturedArticlesSlot3Layout }
  | { ok: false; message: string }

export function parseSlot3LayoutBodyField(body: Record<string, unknown>): Slot3LayoutParseResult {
  if (!Object.prototype.hasOwnProperty.call(body, 'slot3Layout')) {
    return { ok: true, omit: true }
  }

  const v = body.slot3Layout
  if (v === null) {
    return { ok: true, omit: false, value: 'hero-left' }
  }
  if (typeof v !== 'string') {
    return { ok: false, message: 'slot3Layout must be a string.' }
  }

  if (!(FEATURED_ARTICLES_SLOT3_LAYOUT_VALUES as readonly string[]).includes(v)) {
    return {
      ok: false,
      message: `slot3Layout must be one of: ${FEATURED_ARTICLES_SLOT3_LAYOUT_VALUES.join(', ')}.`,
    }
  }

  return { ok: true, omit: false, value: v as FeaturedArticlesSlot3Layout }
}

export function normalizeFeaturedArticlesSlot4Layout(raw: unknown): FeaturedArticlesSlot4Layout {
  if (raw === 'one-over-three' || raw === 'sidebar-stack') return raw
  return 'sidebar-stack'
}

export function publicFeaturedArticlesSlot4Layout(
  block: { slot4Layout?: unknown },
  totalSlots: number,
): FeaturedArticlesSlot4Layout | null {
  if (totalSlots !== 4) return null
  return normalizeFeaturedArticlesSlot4Layout(block.slot4Layout)
}

type Slot4LayoutParseResult =
  | { ok: true; omit: true }
  | { ok: true; omit: false; value: FeaturedArticlesSlot4Layout }
  | { ok: false; message: string }

export function parseSlot4LayoutBodyField(body: Record<string, unknown>): Slot4LayoutParseResult {
  if (!Object.prototype.hasOwnProperty.call(body, 'slot4Layout')) {
    return { ok: true, omit: true }
  }

  const v = body.slot4Layout
  if (v === null) {
    return { ok: true, omit: false, value: 'sidebar-stack' }
  }
  if (typeof v !== 'string') {
    return { ok: false, message: 'slot4Layout must be a string.' }
  }

  if (!(FEATURED_ARTICLES_SLOT4_LAYOUT_VALUES as readonly string[]).includes(v)) {
    return {
      ok: false,
      message: `slot4Layout must be one of: ${FEATURED_ARTICLES_SLOT4_LAYOUT_VALUES.join(', ')}.`,
    }
  }

  return { ok: true, omit: false, value: v as FeaturedArticlesSlot4Layout }
}

export function normalizeFeaturedArticlesSlot5Layout(raw: unknown): FeaturedArticlesSlot5Layout {
  if (raw === 'hero-sidebar' || raw === 'card-grid') return raw
  return 'card-grid'
}

export function publicFeaturedArticlesSlot5Layout(
  block: { slot5Layout?: unknown },
  totalSlots: number,
): FeaturedArticlesSlot5Layout | null {
  if (totalSlots !== 5) return null
  return normalizeFeaturedArticlesSlot5Layout(block.slot5Layout)
}

type Slot5LayoutParseResult =
  | { ok: true; omit: true }
  | { ok: true; omit: false; value: FeaturedArticlesSlot5Layout }
  | { ok: false; message: string }

export function parseSlot5LayoutBodyField(body: Record<string, unknown>): Slot5LayoutParseResult {
  if (!Object.prototype.hasOwnProperty.call(body, 'slot5Layout')) {
    return { ok: true, omit: true }
  }

  const v = body.slot5Layout
  if (v === null) {
    return { ok: true, omit: false, value: 'card-grid' }
  }
  if (typeof v !== 'string') {
    return { ok: false, message: 'slot5Layout must be a string.' }
  }

  if (!(FEATURED_ARTICLES_SLOT5_LAYOUT_VALUES as readonly string[]).includes(v)) {
    return {
      ok: false,
      message: `slot5Layout must be one of: ${FEATURED_ARTICLES_SLOT5_LAYOUT_VALUES.join(', ')}.`,
    }
  }

  return { ok: true, omit: false, value: v as FeaturedArticlesSlot5Layout }
}
