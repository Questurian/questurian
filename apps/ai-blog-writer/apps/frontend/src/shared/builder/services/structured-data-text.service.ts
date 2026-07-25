import { isRecord } from './structured-data-primitives'

export function extractLexicalText(value: unknown): string {
  const chunks: string[] = []

  const visit = (node: unknown) => {
    if (typeof node === 'string') {
      const normalized = node.trim()
      if (normalized) chunks.push(normalized)
      return
    }

    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }

    if (!isRecord(node)) return

    if (typeof node.text === 'string') {
      const normalized = node.text.trim()
      if (normalized) chunks.push(normalized)
    }

    Object.values(node).forEach(visit)
  }

  visit(value)

  const deduped = chunks.filter((value, index) => chunks.indexOf(value) === index)
  return deduped.join(' ').replace(/\s+/g, ' ').trim()
}

export const extractDraftText = (markdown: string, lexicalJson?: string): string => {
  const markdownText = markdown.trim()
  if (markdownText) return markdownText

  const lexicalInput = (lexicalJson || '').trim()
  if (!lexicalInput) return ''

  try {
    const parsed = JSON.parse(lexicalInput)
    return extractLexicalText(parsed)
  } catch {
    return ''
  }
}

export const STRUCTURED_DESCRIPTION_MAX_LENGTH = 220

export const stripMarkdownSyntax = (value: string): string => (
  value
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`{1,3}[^`]*`{1,3}/g, ' ')
    .replace(/[*_~>#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
)

export const stripPromotionalLeadIn = (value: string): string => {
  const leadInPatterns = [
    /^discover\s+/i,
    /^explore\s+/i,
    /^experience\s+/i,
    /^enjoy\s+/i,
    /^visit\s+/i,
  ]

  for (const pattern of leadInPatterns) {
    if (pattern.test(value)) {
      return value.replace(pattern, '').trim()
    }
  }

  return value
}

export const clipReadableText = (value: string, maxLength: number): string => {
  if (value.length <= maxLength) return value

  const sentenceCandidates = value
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean)

  const sentenceFit = sentenceCandidates.find((candidate) => candidate.length <= maxLength)
  if (sentenceFit && sentenceFit.length >= Math.floor(maxLength * 0.6)) {
    return sentenceFit
  }

  const clipped = value.slice(0, maxLength)
  const lastSpace = clipped.lastIndexOf(' ')
  const base = (lastSpace >= Math.floor(maxLength * 0.5) ? clipped.slice(0, lastSpace) : clipped).trim()
  return base.replace(/[,:;.\-–—\s]+$/g, '')
}

export function toStructuredDescription(value: string | undefined): string | undefined {
  if (!value) return undefined

  const normalized = stripPromotionalLeadIn(stripMarkdownSyntax(value))
  if (!normalized) return undefined

  return clipReadableText(normalized, STRUCTURED_DESCRIPTION_MAX_LENGTH)
}
