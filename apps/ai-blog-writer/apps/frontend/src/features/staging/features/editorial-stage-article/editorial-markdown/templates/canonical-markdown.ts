import {
  EDITORIAL_MAX_FAQ_ITEMS,
  EDITORIAL_MAX_TAKEAWAYS,
  FAQ_COMPONENT,
  FAQ_LABEL,
  HIGHLIGHT_CALLOUT_COMPONENT,
  HIGHLIGHT_CALLOUT_LABEL,
  IN_THE_KNOW_COMPONENT,
  IN_THE_KNOW_LABEL,
  KEY_TAKEAWAYS_COMPONENT,
  KEY_TAKEAWAYS_LABEL,
  PULL_QUOTE_COMPONENT,
  PULL_QUOTE_LABEL,
} from '../../constants'
import type { FAQItem } from '../publishing/editorial-publish.types'

export function buildCanonicalKeyTakeawaysMarkdown(
  label: string,
  rawItems: string[],
  options?: {
    useFallbackItems?: boolean
  }
): string {
  const normalizedLabel = label.trim() || KEY_TAKEAWAYS_LABEL
  const useFallbackItems = options?.useFallbackItems ?? true
  const normalizedItems = rawItems
    .map((item) =>
      item
        .replace(/^[-*+]\s+/, '')
        .replace(/^\d+\.\s+/, '')
        .trim()
    )
  const nonEmptyItems = normalizedItems.filter((item) => item.length > 0)

  const items = useFallbackItems
    ? nonEmptyItems.length > 0
      ? nonEmptyItems.slice(0, EDITORIAL_MAX_TAKEAWAYS)
      : ['Add takeaway 1', 'Add takeaway 2', 'Add takeaway 3']
    : normalizedItems.length > 0
      ? normalizedItems.slice(0, EDITORIAL_MAX_TAKEAWAYS)
      : ['']

  return [
    `> [!EDITORIAL-BLOCK-START|${KEY_TAKEAWAYS_COMPONENT}]`,
    `> [!EDITORIAL-BLOCK-LABEL|${normalizedLabel}]`,
    `> [!EDITORIAL-BOX|${KEY_TAKEAWAYS_COMPONENT}]`,
    `> **Component:** ${normalizedLabel}`,
    ...items.map((item) => `> - ${item}`),
    `> [!EDITORIAL-BLOCK-END|${KEY_TAKEAWAYS_COMPONENT}]`,
  ].join('\n')
}

export function buildCanonicalPullQuoteMarkdown(
  label: string,
  rawQuote: string,
  options?: {
    useFallbackQuote?: boolean
  }
): string {
  const normalizedLabel = label.trim() || PULL_QUOTE_LABEL
  const useFallbackQuote = options?.useFallbackQuote ?? true
  const quote = rawQuote.trim()
  const normalizedQuote = quote || (useFallbackQuote ? 'Add pull quote before publishing.' : '')

  return [
    `> [!EDITORIAL-BLOCK-START|${PULL_QUOTE_COMPONENT}]`,
    `> [!EDITORIAL-BLOCK-LABEL|${normalizedLabel}]`,
    `> [!EDITORIAL-BOX|${PULL_QUOTE_COMPONENT}]`,
    `> **Component:** ${normalizedLabel}`,
    `> "${normalizedQuote}"`,
    `> [!EDITORIAL-BLOCK-END|${PULL_QUOTE_COMPONENT}]`,
  ].join('\n')
}

export function buildCanonicalInTheKnowMarkdown(
  label: string,
  rawText: string,
  options?: {
    useFallbackText?: boolean
  }
): string {
  const normalizedLabel = label.trim() || IN_THE_KNOW_LABEL
  const useFallbackText = options?.useFallbackText ?? true
  const text = rawText.trim()
  const normalizedText = text || (useFallbackText ? 'Add context details before publishing.' : '')

  return [
    `> [!EDITORIAL-BLOCK-START|${IN_THE_KNOW_COMPONENT}]`,
    `> [!EDITORIAL-BLOCK-LABEL|${normalizedLabel}]`,
    `> [!EDITORIAL-BOX|${IN_THE_KNOW_COMPONENT}]`,
    `> **Component:** ${normalizedLabel}`,
    ...normalizedText.split('\n').map((line) => `> ${line}`),
    `> [!EDITORIAL-BLOCK-END|${IN_THE_KNOW_COMPONENT}]`,
  ].join('\n')
}

export function buildCanonicalHighlightCalloutMarkdown(
  label: string,
  rawText: string,
  options?: {
    useFallbackText?: boolean
  }
): string {
  const normalizedLabel = label.trim() || HIGHLIGHT_CALLOUT_LABEL
  const useFallbackText = options?.useFallbackText ?? true
  const text = rawText.trim()
  const normalizedText = text || (useFallbackText ? 'Add highlight text before publishing.' : '')

  return [
    `> [!EDITORIAL-BLOCK-START|${HIGHLIGHT_CALLOUT_COMPONENT}]`,
    `> [!EDITORIAL-BLOCK-LABEL|${normalizedLabel}]`,
    `> [!EDITORIAL-BOX|${HIGHLIGHT_CALLOUT_COMPONENT}]`,
    `> **Component:** ${normalizedLabel}`,
    ...normalizedText.split('\n').map((line) => `> ${line}`),
    `> [!EDITORIAL-BLOCK-END|${HIGHLIGHT_CALLOUT_COMPONENT}]`,
  ].join('\n')
}

export function buildCanonicalFAQMarkdown(
  label: string,
  rawItems: FAQItem[],
  options?: {
    useFallbackItems?: boolean
  }
): string {
  const normalizedLabel = label.trim() || FAQ_LABEL
  const useFallbackItems = options?.useFallbackItems ?? true
  const normalizedItems = rawItems
    .map((item) => ({
      question: item.question.trim(),
      answer: item.answer.trim(),
    }))
    .filter((item) => item.question.length > 0 || item.answer.length > 0)

  const items = useFallbackItems
    ? normalizedItems.length >= 2
      ? normalizedItems.slice(0, EDITORIAL_MAX_FAQ_ITEMS)
      : [
          ...normalizedItems,
          ...Array.from({ length: Math.max(0, 2 - normalizedItems.length) }, (_, index) => ({
            question: `Add FAQ question ${normalizedItems.length + index + 1}?`,
            answer: 'Add answer before publishing.',
          })),
        ].slice(0, EDITORIAL_MAX_FAQ_ITEMS)
    : normalizedItems.length > 0
      ? normalizedItems.slice(0, EDITORIAL_MAX_FAQ_ITEMS)
      : [{ question: '', answer: '' }, { question: '', answer: '' }]

  return [
    `> [!EDITORIAL-BLOCK-START|${FAQ_COMPONENT}]`,
    `> [!EDITORIAL-BLOCK-LABEL|${normalizedLabel}]`,
    `> [!EDITORIAL-BOX|${FAQ_COMPONENT}]`,
    `> **Component:** ${normalizedLabel}`,
    ...items.flatMap((item) => ([
      `> **Q:** ${item.question}`,
      `> A: ${item.answer}`,
    ])),
    `> [!EDITORIAL-BLOCK-END|${FAQ_COMPONENT}]`,
  ].join('\n')
}
