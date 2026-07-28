import { markdownToEditorHtml } from '../richMarkdown'

export type PasteInsertion =
  | { kind: 'text'; value: string }
  | { kind: 'html'; value: string }

/**
 * Decides what a paste should actually insert.
 *
 * Only the clipboard's plain-text flavour is ever used. Letting the browser
 * drop its `text/html` flavour into the contenteditable is what made pasting
 * from Docs or a web page produce styled span/font/div soup that the markdown
 * serializer then had to guess its way through.
 *
 * Plain text is re-read as markdown, which is the format this editor stores, so
 * pasting a markdown draft yields real headings and lists rather than literal
 * `##`. A single-line paste stays literal text: it is an inline paste into an
 * existing sentence, and wrapping it in a block would split the paragraph.
 */
export function buildPasteInsertion(clipboardText: string): PasteInsertion | null {
  const normalized = clipboardText.replace(/\r\n?/g, '\n')
  if (!normalized) return null

  if (!normalized.includes('\n')) {
    return { kind: 'text', value: normalized }
  }

  return { kind: 'html', value: markdownToEditorHtml(normalized) }
}
