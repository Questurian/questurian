import { describe, expect, it } from 'vitest'

import { judgeRender } from './front-door-render'

// What Next sent for a missing itinerary while its loading.tsx streamed the
// shell before the page's notFound(): HTTP 200, noindex, and the fallback
// marker in the flight data.
const STREAMED_NOT_FOUND =
  '<html><head><meta name="robots" content="noindex"/></head><body>…"digest":"NEXT_HTTP_ERROR_FALLBACK;404"…</body></html>'
const NOT_FOUND_PAGE = '<html><head><meta name="robots" content="noindex"/></head><body>Page not found</body></html>'

describe('front-door render verdict', () => {
  it('passes a missing page that answers 404', () => {
    expect(judgeRender({ expect: 404 }, 404, NOT_FOUND_PAGE).ok).toBe(true)
  })

  it('fails a streamed not-found (HTTP 200 + noindex) where 404 is expected', () => {
    const verdict = judgeRender({ expect: 404 }, 200, STREAMED_NOT_FOUND)
    expect(verdict.ok).toBe(false)
    expect(verdict.statusOk).toBe(false)
    expect(verdict.detail).toContain('HTTP 200')
    expect(verdict.detail).toContain('streamed not-found')
  })

  it('fails a draft that answers 200 even with no draft content in it', () => {
    const verdict = judgeRender({ expect: 404, absent: 'draft-body-marker' }, 200, STREAMED_NOT_FOUND)
    expect(verdict.ok).toBe(false)
    expect(verdict.leaked).toBe(false)
  })

  it('fails a draft whose body leaks, whatever the status', () => {
    const verdict = judgeRender({ expect: 404, absent: 'draft-body-marker' }, 404, '<p>draft-body-marker</p>')
    expect(verdict.ok).toBe(false)
    expect(verdict.detail).toContain('DRAFT CONTENT LEAKED')
  })

  it('passes a published page with its marker and fails one without', () => {
    expect(judgeRender({ expect: 200, marker: 'Title-7' }, 200, '<h1>Title-7</h1>').ok).toBe(true)
    const missing = judgeRender({ expect: 200, marker: 'Title-7' }, 200, '<h1>Other</h1>')
    expect(missing.ok).toBe(false)
    expect(missing.detail).toBe('HTTP 200, marker absent')
  })

  it('fails a published page that answers 404', () => {
    expect(judgeRender({ expect: 200 }, 404, NOT_FOUND_PAGE).ok).toBe(false)
  })
})
