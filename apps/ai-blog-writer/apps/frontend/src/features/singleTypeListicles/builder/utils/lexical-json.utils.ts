export function readLexicalFromJsonText(value: string, fieldLabel: string): Record<string, unknown> {
  const trimmed = value.trim()
  if (!trimmed) return {}

  try {
    const parsed = JSON.parse(trimmed)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error(`${fieldLabel} JSON must be an object`)
    }
    return parsed as Record<string, unknown>
  } catch (err) {
    throw new Error(err instanceof Error ? `${fieldLabel}: ${err.message}` : `${fieldLabel}: invalid JSON`)
  }
}

type LexicalNode = {
  type?: string
  text?: string
  format?: number
  tag?: string
  listType?: string
  value?: number
  children?: LexicalNode[]
  url?: string
  direction?: string
  indent?: number
}

function applyTextFormat(text: string, format: number): string {
  if (!text) return text
  let result = text
  // format flags: 1=bold, 2=italic, 4=strikethrough, 8=underline, 16=code
  if (format & 16) result = `\`${result}\``
  if (format & 4) result = `~~${result}~~`
  if (format & 2) result = `*${result}*`
  if (format & 1) result = `**${result}**`
  return result
}

function lexicalNodeToMarkdown(node: LexicalNode, listDepth = 0, listCounters: number[] = []): string {
  const { type, children = [], text = '', format = 0, tag, listType, value } = node

  if (type === 'text') {
    if (text === '\n') return '\n'
    return applyTextFormat(text, format)
  }

  if (type === 'linebreak') return '\n'

  if (type === 'link') {
    const url = (node as LexicalNode & { url?: string }).url || ''
    const inner = children.map((c) => lexicalNodeToMarkdown(c, listDepth, listCounters)).join('')
    return url ? `[${inner}](${url})` : inner
  }

  if (type === 'paragraph') {
    const inner = children.map((c) => lexicalNodeToMarkdown(c, listDepth, listCounters)).join('')
    return inner
  }

  if (type === 'heading') {
    const level = tag ? parseInt(tag.replace('h', ''), 10) : 2
    const inner = children.map((c) => lexicalNodeToMarkdown(c, listDepth, listCounters)).join('')
    return `${'#'.repeat(level)} ${inner}`
  }

  if (type === 'quote') {
    const inner = children.map((c) => lexicalNodeToMarkdown(c, listDepth, listCounters)).join('')
    return inner.split('\n').map((line) => `> ${line}`).join('\n')
  }

  if (type === 'code') {
    const inner = children.map((c) => lexicalNodeToMarkdown(c, listDepth, listCounters)).join('')
    return `\`\`\`\n${inner}\n\`\`\``
  }

  if (type === 'list') {
    const counters = [...listCounters, listType === 'number' ? (value ?? 1) - 1 : 0]
    const items = children.map((child) => lexicalNodeToMarkdown(child, listDepth + 1, counters))
    return items.join('\n')
  }

  if (type === 'listitem') {
    const indent = '  '.repeat(Math.max(listDepth - 1, 0))
    const parentList = listCounters[listCounters.length - 1]
    const isOrdered = typeof parentList === 'number'
    const bullet = isOrdered ? `${parentList + 1}.` : '-'
    if (isOrdered) listCounters[listCounters.length - 1]++
    const inner = children.map((c) => lexicalNodeToMarkdown(c, listDepth, listCounters)).join('')
    return `${indent}${bullet} ${inner}`
  }

  // root or unknown — recurse into children, join paragraphs with double newline
  const parts = children.map((c) => lexicalNodeToMarkdown(c, listDepth, listCounters))
  return parts.join('\n\n')
}

export function lexicalRichTextToMarkdown(lexical: Record<string, unknown> | null | undefined): string {
  if (!lexical) return ''
  const root = lexical.root as LexicalNode | undefined
  if (!root) return ''
  return lexicalNodeToMarkdown(root).trim()
}
