import { beforeEach, describe, expect, it } from 'vitest'
import {
  getActiveBlockTag,
  getRangeFromBlockStartToCaret,
  isCaretAtEndOfBlock,
} from './editor-dom.utils'

function mountEditor(html: string): HTMLDivElement {
  const editor = document.createElement('div')
  editor.contentEditable = 'true'
  editor.innerHTML = html
  document.body.appendChild(editor)
  return editor
}

/** Put a collapsed caret `offset` characters into `node`'s text. */
function placeCaret(node: Node, offset: number): void {
  const range = document.createRange()
  range.setStart(node, offset)
  range.collapse(true)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

beforeEach(() => {
  document.body.innerHTML = ''
  window.getSelection()?.removeAllRanges()
})

describe('getRangeFromBlockStartToCaret', () => {
  it('captures exactly the text typed before the caret', () => {
    const editor = mountEditor('<p>## Heading text</p>')
    const paragraph = editor.querySelector('p')!
    const text = paragraph.firstChild!

    placeCaret(text, 2)

    const range = getRangeFromBlockStartToCaret(editor, paragraph)
    expect(range?.toString()).toBe('##')
  })

  it('is empty when the caret sits at the block start', () => {
    const editor = mountEditor('<p>text</p>')
    const paragraph = editor.querySelector('p')!

    placeCaret(paragraph.firstChild!, 0)

    expect(getRangeFromBlockStartToCaret(editor, paragraph)?.toString()).toBe('')
  })

  it('deletes precisely the matched prefix', () => {
    const editor = mountEditor('<p>- item</p>')
    const paragraph = editor.querySelector('p')!

    placeCaret(paragraph.firstChild!, 1)

    const range = getRangeFromBlockStartToCaret(editor, paragraph)!
    expect(range.toString()).toBe('-')
    range.deleteContents()
    expect(paragraph.textContent).toBe(' item')
  })

  it('refuses a selection that is not collapsed', () => {
    const editor = mountEditor('<p>## Heading</p>')
    const paragraph = editor.querySelector('p')!
    const range = document.createRange()
    range.setStart(paragraph.firstChild!, 0)
    range.setEnd(paragraph.firstChild!, 2)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)

    expect(getRangeFromBlockStartToCaret(editor, paragraph)).toBeNull()
  })

  it('refuses a caret outside the given block', () => {
    const editor = mountEditor('<p id="a">first</p><p id="b">second</p>')
    const first = editor.querySelector('#a') as HTMLElement
    const second = editor.querySelector('#b') as HTMLElement

    placeCaret(second.firstChild!, 2)

    expect(getRangeFromBlockStartToCaret(editor, first)).toBeNull()
  })
})

describe('isCaretAtEndOfBlock', () => {
  it('is true at the end of the block text', () => {
    const editor = mountEditor('<h2>Section</h2>')
    const heading = editor.querySelector('h2')!

    placeCaret(heading.firstChild!, 'Section'.length)

    expect(isCaretAtEndOfBlock(editor, heading)).toBe(true)
  })

  it('is false mid-word', () => {
    const editor = mountEditor('<h2>Section</h2>')
    const heading = editor.querySelector('h2')!

    placeCaret(heading.firstChild!, 3)

    expect(isCaretAtEndOfBlock(editor, heading)).toBe(false)
  })

  it('is true in an empty block', () => {
    const editor = mountEditor('<h2></h2>')
    const heading = editor.querySelector('h2')!

    placeCaret(heading, 0)

    expect(isCaretAtEndOfBlock(editor, heading)).toBe(true)
  })
})

describe('getActiveBlockTag', () => {
  it('reports the nearest block ancestor of the caret', () => {
    const editor = mountEditor('<h3>Title</h3>')
    placeCaret(editor.querySelector('h3')!.firstChild!, 1)
    expect(getActiveBlockTag(editor)).toBe('H3')
  })

  it('sees through inline formatting', () => {
    const editor = mountEditor('<p>plain <strong>bold</strong></p>')
    placeCaret(editor.querySelector('strong')!.firstChild!, 2)
    expect(getActiveBlockTag(editor)).toBe('P')
  })

  it('reports the list item rather than the list', () => {
    const editor = mountEditor('<ul><li>one</li></ul>')
    placeCaret(editor.querySelector('li')!.firstChild!, 1)
    expect(getActiveBlockTag(editor)).toBe('LI')
  })

  it('returns null when the caret is outside the editor', () => {
    const editor = mountEditor('<p>inside</p>')
    const outside = document.createElement('p')
    outside.textContent = 'outside'
    document.body.appendChild(outside)

    placeCaret(outside.firstChild!, 2)

    expect(getActiveBlockTag(editor)).toBeNull()
  })
})
