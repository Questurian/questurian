import { describe, expect, it } from 'vitest'

import {
  getPageBlocksFieldName,
  mergeHomepageBlockFields,
  parseHomepageEditorModeParam,
} from './types'

describe('homepage editor mode', () => {
  it('defaults invalid or missing mode to explore', () => {
    expect(parseHomepageEditorModeParam(null)).toBe('explore')
    expect(parseHomepageEditorModeParam(undefined)).toBe('explore')
    expect(parseHomepageEditorModeParam('')).toBe('explore')
    expect(parseHomepageEditorModeParam('bogus')).toBe('explore')
  })

  it('accepts stay and move', () => {
    expect(parseHomepageEditorModeParam('stay')).toBe('stay')
    expect(parseHomepageEditorModeParam('move')).toBe('move')
  })

  it('maps mode to Payload field names', () => {
    expect(getPageBlocksFieldName('explore')).toBe('pageBlocks')
    expect(getPageBlocksFieldName('stay')).toBe('pageBlocksStay')
    expect(getPageBlocksFieldName('move')).toBe('pageBlocksMove')
  })

  it('mergeHomepageBlockFields updates only the requested field', () => {
    const explore = [{ id: 'a' }]
    const stay = [{ id: 'b' }]
    const doc = {
      pageBlocks: explore,
      pageBlocksStay: stay,
      pageBlocksMove: [],
    }
    const nextStay = [{ id: 'c' }]
    const merged = mergeHomepageBlockFields(doc, 'pageBlocksStay', nextStay)
    expect(merged.pageBlocks).toEqual(explore)
    expect(merged.pageBlocksStay).toEqual(nextStay)
    expect(merged.pageBlocksMove).toEqual([])
  })
})
