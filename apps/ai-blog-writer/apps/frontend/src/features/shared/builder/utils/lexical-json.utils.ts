import { stripIdsDeep } from './strip-ids-deep.utils'

/**
 * Lexical JSON (and Payload round-trips) embed `id` on many nodes. Postgres row ids
 * for rich text must be unique; strip every `id` key in the tree before API submit.
 */
export function stripLexicalEditorStateId<T>(value: T): T {
  return stripIdsDeep(value) as T
}

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
    const inner = children.map((child) => lexicalNodeToMarkdown(child, listDepth, listCounters)).join('')
    return node.url ? `[${inner}](${node.url})` : inner
  }

  if (type === 'paragraph') {
    return children.map((child) => lexicalNodeToMarkdown(child, listDepth, listCounters)).join('')
  }

  if (type === 'heading') {
    const level = tag ? parseInt(tag.replace('h', ''), 10) : 2
    const inner = children.map((child) => lexicalNodeToMarkdown(child, listDepth, listCounters)).join('')
    return `${'#'.repeat(level)} ${inner}`
  }

  if (type === 'quote') {
    const inner = children.map((child) => lexicalNodeToMarkdown(child, listDepth, listCounters)).join('')
    return inner.split('\n').map((line) => `> ${line}`).join('\n')
  }

  if (type === 'code') {
    const inner = children.map((child) => lexicalNodeToMarkdown(child, listDepth, listCounters)).join('')
    return `\`\`\`\n${inner}\n\`\`\``
  }

  if (type === 'list') {
    const counters = [...listCounters, listType === 'number' ? (value ?? 1) - 1 : Number.NaN]
    return children.map((child) => lexicalNodeToMarkdown(child, listDepth + 1, counters)).join('\n')
  }

  if (type === 'listitem') {
    const indent = '  '.repeat(Math.max(listDepth - 1, 0))
    const counterIndex = listCounters.length - 1
    const parentCounter = listCounters[counterIndex]
    const isOrdered = Number.isFinite(parentCounter)
    const bullet = isOrdered ? `${parentCounter + 1}.` : '-'
    if (isOrdered) listCounters[counterIndex] = parentCounter + 1
    const inner = children.map((child) => lexicalNodeToMarkdown(child, listDepth, listCounters)).join('')
    return `${indent}${bullet} ${inner}`
  }

  return children.map((child) => lexicalNodeToMarkdown(child, listDepth, listCounters)).join('\n\n')
}

export function lexicalRichTextToMarkdown(lexical: Record<string, unknown> | null | undefined): string {
  if (!lexical) return ''
  const root = lexical.root as LexicalNode | undefined
  if (!root) return ''
  return lexicalNodeToMarkdown(root).trim()
}
