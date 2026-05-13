import { ARTICLE_GRID_FOUR_LAYOUT_VALUES, type ArticleGridFourLayout } from '../constants'

export function normalizeArticleGridFourLayout(raw: unknown): ArticleGridFourLayout {
  if (raw === 'two-by-two' || raw === 'four-across') return raw
  return 'four-across'
}

/**
 * API: only when the block has exactly four slots; otherwise null.
 */
export function publicArticleGridFourLayout(
  block: { articleGridFourLayout?: unknown },
  totalSlots: number,
): ArticleGridFourLayout | null {
  if (totalSlots !== 4) return null
  return normalizeArticleGridFourLayout(block.articleGridFourLayout)
}

type ParseResult =
  | { ok: true; omit: true }
  | { ok: true; omit: false; value: ArticleGridFourLayout }
  | { ok: false; message: string }

export function parseArticleGridFourLayoutBodyField(
  body: Record<string, unknown>,
): ParseResult {
  if (!Object.prototype.hasOwnProperty.call(body, 'articleGridFourLayout')) {
    return { ok: true, omit: true }
  }

  const v = body.articleGridFourLayout
  if (v === null) {
    return { ok: true, omit: false, value: 'four-across' }
  }
  if (typeof v !== 'string') {
    return { ok: false, message: 'articleGridFourLayout must be a string.' }
  }

  if (!(ARTICLE_GRID_FOUR_LAYOUT_VALUES as readonly string[]).includes(v)) {
    return {
      ok: false,
      message: `articleGridFourLayout must be one of: ${ARTICLE_GRID_FOUR_LAYOUT_VALUES.join(', ')}.`,
    }
  }

  return { ok: true, omit: false, value: v as ArticleGridFourLayout }
}
