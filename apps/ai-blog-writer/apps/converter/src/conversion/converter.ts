import { $generateHtmlFromNodes, $generateNodesFromDOM } from '@lexical/html'
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  TRANSFORMERS
} from '@lexical/markdown'
import { JSDOM } from 'jsdom'
import { $getRoot, $insertNodes } from 'lexical'

import { createEditor } from '../editor/create-editor.js'

function withDom<T>(dom: JSDOM, callback: () => T): T {
  const previousDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    'document'
  )
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')

  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: dom.window.document
  })
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: dom.window
  })

  try {
    return callback()
  } finally {
    if (previousDocument) {
      Object.defineProperty(globalThis, 'document', previousDocument)
    } else {
      delete (globalThis as { document?: Document }).document
    }

    if (previousWindow) {
      Object.defineProperty(globalThis, 'window', previousWindow)
    } else {
      delete (globalThis as { window?: Window }).window
    }
  }
}

/**
 * Convert Markdown to Lexical JSON.
 */
export async function markdownToLexical(markdown: string): Promise<object> {
  const editor = createEditor()

  await editor.update(() => {
    $convertFromMarkdownString(markdown, TRANSFORMERS)
  })

  return editor.getEditorState().toJSON()
}

/**
 * Convert HTML to Lexical JSON.
 */
export async function htmlToLexical(html: string): Promise<object> {
  const editor = createEditor()
  const dom = new JSDOM(`<!DOCTYPE html><body>${html}</body>`)

  await editor.update(() => {
    const nodes = $generateNodesFromDOM(editor, dom.window.document)
    const root = $getRoot()
    root.clear()
    $insertNodes(nodes)
  })

  return editor.getEditorState().toJSON()
}

/**
 * Convert Lexical JSON to HTML.
 */
export async function lexicalToHtml(lexicalState: object): Promise<string> {
  const editor = createEditor()
  const state = editor.parseEditorState(JSON.stringify(lexicalState))
  editor.setEditorState(state)
  const dom = new JSDOM('<!DOCTYPE html><body></body>')

  let html = ''
  withDom(dom, () => {
    state.read(() => {
      html = $generateHtmlFromNodes(editor, null)
    })
  })

  return html
}

/**
 * Convert Lexical JSON to Markdown.
 */
export async function lexicalToMarkdown(lexicalState: object): Promise<string> {
  const editor = createEditor()
  const state = editor.parseEditorState(JSON.stringify(lexicalState))
  editor.setEditorState(state)

  let markdown = ''
  state.read(() => {
    markdown = $convertToMarkdownString(TRANSFORMERS)
  })

  return markdown
}
