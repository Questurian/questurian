import { describe, expect, it } from 'vitest'
import { matchMarkdownInputRule } from './markdown-input-rules.service'

describe('matchMarkdownInputRule', () => {
  it('matches every heading level', () => {
    for (let level = 1; level <= 6; level += 1) {
      expect(matchMarkdownInputRule('#'.repeat(level))).toEqual({ type: 'heading', level })
    }
  })

  it('stops at H6 rather than matching a longer hash run', () => {
    expect(matchMarkdownInputRule('#######')).toBeNull()
  })

  it('matches each bullet marker', () => {
    expect(matchMarkdownInputRule('-')).toEqual({ type: 'unordered-list' })
    expect(matchMarkdownInputRule('*')).toEqual({ type: 'unordered-list' })
    expect(matchMarkdownInputRule('+')).toEqual({ type: 'unordered-list' })
  })

  it('matches ordered list markers with either delimiter', () => {
    expect(matchMarkdownInputRule('1.')).toEqual({ type: 'ordered-list' })
    expect(matchMarkdownInputRule('42.')).toEqual({ type: 'ordered-list' })
    expect(matchMarkdownInputRule('3)')).toEqual({ type: 'ordered-list' })
  })

  it('treats an implausibly long digit run as prose', () => {
    expect(matchMarkdownInputRule('1234567890.')).toBeNull()
  })

  it('matches a blockquote marker', () => {
    expect(matchMarkdownInputRule('>')).toEqual({ type: 'blockquote' })
  })

  it('ignores shorthand that is not the whole run before the caret', () => {
    // The caret text is anchored to the block start, so prose that merely
    // contains a marker must not trigger a rule.
    expect(matchMarkdownInputRule('Rated 5.')).toBeNull()
    expect(matchMarkdownInputRule('a #')).toBeNull()
    expect(matchMarkdownInputRule('# Already a heading')).toBeNull()
    expect(matchMarkdownInputRule('->')).toBeNull()
  })

  it('ignores an empty run', () => {
    expect(matchMarkdownInputRule('')).toBeNull()
  })

  it('does not match markers that markdown does not define', () => {
    expect(matchMarkdownInputRule('.')).toBeNull()
    expect(matchMarkdownInputRule('1')).toBeNull()
    expect(matchMarkdownInputRule('>>')).toBeNull()
  })
})
