import { describe, expect, it } from 'vitest'

import { normalizeArticleUrlInput } from './urlInput'

describe('normalizeArticleUrlInput', () => {
  it('prepends https to bare domains', () => {
    expect(
      normalizeArticleUrlInput(
        'www.travelandtourworld.com/news/article/colombia-joins-bolivia-peru-and-ecuador-as-andean-migration-card-simplifies-travel-boosting-tourism-across-la-paz-bogota-quito-and-lima-from-2026-find-more-about-it-now'
      )
    ).toBe(
      'https://www.travelandtourworld.com/news/article/colombia-joins-bolivia-peru-and-ecuador-as-andean-migration-card-simplifies-travel-boosting-tourism-across-la-paz-bogota-quito-and-lima-from-2026-find-more-about-it-now'
    )
  })

  it('keeps absolute urls intact', () => {
    expect(normalizeArticleUrlInput('https://example.com/article')).toBe(
      'https://example.com/article'
    )
  })

  it('rejects non-http protocols', () => {
    expect(normalizeArticleUrlInput('ftp://example.com/file')).toBeNull()
  })

  it('rejects empty input', () => {
    expect(normalizeArticleUrlInput('   ')).toBeNull()
  })
})
