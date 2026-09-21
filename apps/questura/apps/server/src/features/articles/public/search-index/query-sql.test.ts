import { describe, expect, it } from 'vitest'

import { INDEXED_ARTICLE_SEARCH_SQL, substringPattern } from './query-sql'

describe('substringPattern', () => {
  it('wraps the needle in wildcards and lowercases it', () => {
    expect(substringPattern('Lima')).toBe('%lima%')
  })

  // The old form was `position(needle IN phrase_text) > 0`, which has no
  // wildcards to escape. Moving to LIKE so a trigram index can serve it adds
  // that hazard: unescaped, `100%` would match every document and `a_b` would
  // match `axb`.
  it('escapes the caller\u2019s own wildcards', () => {
    expect(substringPattern('100%')).toBe('%100\\%%')
    expect(substringPattern('a_b')).toBe('%a\\_b%')
    expect(substringPattern('c:\\path')).toBe('%c:\\\\path%')
  })
})

describe('INDEXED_ARTICLE_SEARCH_SQL', () => {
  it('keeps the ranking weights the corpus query used', () => {
    expect(INDEXED_ARTICLE_SEARCH_SQL).toContain('ts_rank_cd(d.document, query.tsq, 32) * 10')
    expect(INDEXED_ARTICLE_SEARCH_SQL).toContain('THEN 4 ELSE 0 END')
    expect(INDEXED_ARTICLE_SEARCH_SQL).toContain('THEN 2 ELSE 0 END')
    expect(INDEXED_ARTICLE_SEARCH_SQL).toContain('THEN 1 ELSE 0 END')
  })

  it('takes its substring pattern as a parameter rather than building one', () => {
    expect(INDEXED_ARTICLE_SEARCH_SQL).toContain("LIKE $5 ESCAPE '\\'")
    expect(INDEXED_ARTICLE_SEARCH_SQL).not.toContain("'%' ||")
  })

  it('orders by rank then date then id, so pages cannot overlap', () => {
    expect(INDEXED_ARTICLE_SEARCH_SQL).toContain(
      'ORDER BY page_rows.rank DESC, page_rows.published_at DESC NULLS LAST, page_rows.doc_id DESC',
    )
  })
})
