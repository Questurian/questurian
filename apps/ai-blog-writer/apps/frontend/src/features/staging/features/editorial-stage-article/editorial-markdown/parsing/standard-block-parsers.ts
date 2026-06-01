import type { EditorialBlock } from '../../../../types'
import {
  HIGHLIGHT_CALLOUT_COMPONENT,
  HIGHLIGHT_CALLOUT_LABEL,
  IN_THE_KNOW_COMPONENT,
  IN_THE_KNOW_LABEL,
  KEY_TAKEAWAYS_COMPONENT,
  KEY_TAKEAWAYS_LABEL,
  PULL_QUOTE_COMPONENT,
  PULL_QUOTE_LABEL,
} from '../../constants'
import {
  buildCanonicalHighlightCalloutMarkdown,
  buildCanonicalInTheKnowMarkdown,
  buildCanonicalKeyTakeawaysMarkdown,
  buildCanonicalPullQuoteMarkdown,
} from '../templates/canonical-markdown'
import { parseEditorialFrame } from './editorial-frame'

type ParsedEditorialBlockBase = {
  label: string
  hasStartMarker: boolean
  hasEndMarker: boolean
  hasLabelMarker: boolean
  hasBoxMarker: boolean
  hasComponentLine: boolean
  correctedMarkdown: string
}

export function parseKeyTakeawayEditorialBlock(block: EditorialBlock): ParsedEditorialBlockBase & {
  rawItems: string[]
  items: string[]
} {
  const frame = parseEditorialFrame(block, KEY_TAKEAWAYS_COMPONENT)
  const listItemRegex = /^([-*+]\s+|\d+\.\s+)/
  const rawItems = frame.bodyLines
    .filter((line) => listItemRegex.test(line))
    .map((line) =>
      line
        .replace(/^[-*+]\s+/, '')
        .replace(/^\d+\.\s+/, '')
        .trim()
    )
  const items = rawItems.filter((item) => item.length > 0)
  const label = frame.label || KEY_TAKEAWAYS_LABEL

  return {
    ...frame,
    label,
    rawItems,
    items,
    correctedMarkdown: buildCanonicalKeyTakeawaysMarkdown(label, items),
  }
}

export function parsePullQuoteEditorialBlock(block: EditorialBlock): ParsedEditorialBlockBase & {
  quoteText: string
} {
  const frame = parseEditorialFrame(block, PULL_QUOTE_COMPONENT)
  const quoteCandidates = frame.bodyLines
    .map((line) => line.trim())
    .filter(Boolean)
    .filter(
      (line) =>
        !/^(placement|why)\s*:/i.test(line)
        && !/^\*\*(placement|why):\*\*/i.test(line)
    )
  const quotedCandidate = quoteCandidates.find((line) => /^["“].+["”]$/.test(line))
  const selectedQuote = (quotedCandidate || quoteCandidates.join(' ')).trim()
  const quoteText = selectedQuote
    .replace(/^["'“”\s]+/, '')
    .replace(/["'“”\s]+$/, '')
    .trim()
  const label = frame.label || PULL_QUOTE_LABEL

  return {
    ...frame,
    label,
    quoteText,
    correctedMarkdown: buildCanonicalPullQuoteMarkdown(label, quoteText),
  }
}

export function parseInTheKnowEditorialBlock(block: EditorialBlock): ParsedEditorialBlockBase & {
  text: string
} {
  const frame = parseEditorialFrame(block, IN_THE_KNOW_COMPONENT)
  const text = frame.bodyLines
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim()
  const label = frame.label || IN_THE_KNOW_LABEL

  return {
    ...frame,
    label,
    text,
    correctedMarkdown: buildCanonicalInTheKnowMarkdown(label, text),
  }
}

export function parseHighlightCalloutEditorialBlock(block: EditorialBlock): ParsedEditorialBlockBase & {
  text: string
} {
  const frame = parseEditorialFrame(block, HIGHLIGHT_CALLOUT_COMPONENT)
  const text = frame.bodyLines
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim()
  const label = frame.label || HIGHLIGHT_CALLOUT_LABEL

  return {
    ...frame,
    label,
    text,
    correctedMarkdown: buildCanonicalHighlightCalloutMarkdown(label, text),
  }
}
