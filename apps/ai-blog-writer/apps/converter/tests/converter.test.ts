import assert from 'node:assert/strict'
import test from 'node:test'

import {
  htmlToLexical,
  lexicalToHtml,
  lexicalToMarkdown,
  markdownToLexical
} from '../src/conversion/converter.js'
import { createEditor } from '../src/editor/create-editor.js'

type SerializedNode = {
  children?: SerializedNode[]
  text?: string
  type?: string
}

function rootChildren(state: object): SerializedNode[] {
  return (state as { root: { children: SerializedNode[] } }).root.children
}

test('markdown conversion supports the configured rich-text nodes', async () => {
  const lexical = await markdownToLexical(
    '# A heading\n\n- First\n- Second\n\n> A quote'
  )
  const nodeTypes = rootChildren(lexical).map((node) => node.type)

  assert.deepEqual(nodeTypes, ['heading', 'list', 'quote'])
})

test('the editor can parse Payload horizontal-rule nodes', () => {
  const editor = createEditor()
  const state = editor.parseEditorState(
    JSON.stringify({
      root: {
        children: [{ type: 'horizontalrule', version: 1 }],
        direction: null,
        format: '',
        indent: 0,
        type: 'root',
        version: 1
      }
    })
  )

  assert.equal(rootChildren(state.toJSON())[0]?.type, 'horizontalrule')
})

test('markdown conversion round-trips through Lexical state', async () => {
  const lexical = await markdownToLexical(
    '## Places\n\nVisit **soon**.\n\n1. North\n2. South'
  )
  const markdown = await lexicalToMarkdown(lexical)

  assert.match(markdown, /^## Places/m)
  assert.match(markdown, /Visit \*\*soon\*\*\./)
  assert.match(markdown, /1\. North/)
  assert.match(markdown, /2\. South/)
})

test('HTML conversion preserves headings, paragraphs, and tables', async () => {
  const lexical = await htmlToLexical(
    '<h2>Places</h2><p>Visit <strong>soon</strong>.</p><table><tbody><tr><td>North</td></tr></tbody></table>'
  )
  const nodeTypes = rootChildren(lexical).map((node) => node.type)

  assert.deepEqual(nodeTypes, ['heading', 'paragraph', 'table'])
})

test('Lexical state converts to HTML in the headless runtime', async () => {
  const lexical = await markdownToLexical('## Places\n\nVisit **soon**.')
  const html = await lexicalToHtml(lexical)

  assert.match(html, /<h2><span[^>]*>Places<\/span><\/h2>/)
  assert.match(html, /<strong[^>]*>soon<\/strong>/)
})
