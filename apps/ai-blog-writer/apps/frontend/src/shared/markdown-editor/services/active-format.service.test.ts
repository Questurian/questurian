import { describe, expect, it } from 'vitest'
import { resolveActiveToolbarKeys, type EditorFormatState } from './active-format.service'

const NOTHING_ACTIVE: EditorFormatState = {
  blockTag: null,
  isBold: false,
  isItalic: false,
  isUnorderedList: false,
  isOrderedList: false,
}

function activeKeys(overrides: Partial<EditorFormatState>) {
  return [...resolveActiveToolbarKeys({ ...NOTHING_ACTIVE, ...overrides })].sort()
}

describe('resolveActiveToolbarKeys', () => {
  it('marks the matching heading button', () => {
    expect(activeKeys({ blockTag: 'H2' })).toEqual(['h2'])
    expect(activeKeys({ blockTag: 'H3' })).toEqual(['h3'])
  })

  it('does not mark a heading level the toolbar has no button for', () => {
    expect(activeKeys({ blockTag: 'H4' })).toEqual([])
  })

  it('marks paragraph for plain block tags', () => {
    expect(activeKeys({ blockTag: 'P' })).toEqual(['paragraph'])
    expect(activeKeys({ blockTag: 'DIV' })).toEqual(['paragraph'])
  })

  it('does not call a list item normal text', () => {
    // The browser reports LI with no heading tag; that is still not body copy.
    expect(activeKeys({ blockTag: 'LI', isUnorderedList: true })).toEqual(['bullets'])
  })

  it('does not mark paragraph while inside a list', () => {
    // Chrome reports the block as P for a paragraph nested in a list item.
    expect(activeKeys({ blockTag: 'P', isOrderedList: true })).toEqual(['numbered'])
  })

  it('marks blockquote', () => {
    expect(activeKeys({ blockTag: 'BLOCKQUOTE' })).toEqual(['quote'])
  })

  it('combines block and inline state', () => {
    expect(activeKeys({ blockTag: 'H2', isBold: true, isItalic: true })).toEqual([
      'bold',
      'h2',
      'italic',
    ])
  })

  it('is case insensitive about the tag name', () => {
    expect(activeKeys({ blockTag: 'h2' })).toEqual(['h2'])
  })

  it('reports nothing when the caret is outside any block', () => {
    expect(activeKeys({})).toEqual([])
  })
})
