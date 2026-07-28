import { describe, expect, it } from 'vitest'
import { buildPasteInsertion } from './paste.service'

describe('buildPasteInsertion', () => {
  it('inserts a single line as literal text so an inline paste does not split the paragraph', () => {
    expect(buildPasteInsertion('a pasted phrase')).toEqual({
      kind: 'text',
      value: 'a pasted phrase',
    })
  })

  it('does not interpret markdown on a single line', () => {
    // Wrapping this in a block would break the surrounding sentence.
    expect(buildPasteInsertion('## not a heading here')).toEqual({
      kind: 'text',
      value: '## not a heading here',
    })
  })

  it('reads a multi-line paste as markdown', () => {
    const insertion = buildPasteInsertion('## Section\n\nBody copy.')
    expect(insertion?.kind).toBe('html')
    expect(insertion?.value).toContain('<h2>Section</h2>')
    expect(insertion?.value).toContain('<p>Body copy.</p>')
  })

  it('converts pasted lists into real list markup', () => {
    const insertion = buildPasteInsertion('- one\n- two')
    expect(insertion?.value).toContain('<ul>')
    expect(insertion?.value).toContain('<li>one</li>')
  })

  it('normalizes CRLF and lone CR line endings', () => {
    const crlf = buildPasteInsertion('## Section\r\n\r\nBody.')
    const cr = buildPasteInsertion('## Section\r\rBody.')
    expect(crlf?.value).toContain('<h2>Section</h2>')
    expect(cr?.value).toContain('<h2>Section</h2>')
  })

  it('escapes markup rather than trusting it', () => {
    const insertion = buildPasteInsertion('line one\n<script>alert(1)</script>')
    expect(insertion?.value).not.toContain('<script>')
    expect(insertion?.value).toContain('&lt;script&gt;')
  })

  it('returns nothing for an empty clipboard', () => {
    expect(buildPasteInsertion('')).toBeNull()
  })
})
