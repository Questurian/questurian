import type { CreateArticlePayload } from '../../api'
import type { EditorialBlock } from '../../types'
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
} from './constants'
import type { SupportedEditorialComponent } from './types'

export type PayloadContentBlock = NonNullable<CreateArticlePayload['contentBlocks']>[number]
export type SupportedPayloadBlockType =
  | 'key-takeaway'
  | 'pull-quote'
  | 'in-the-know'
  | 'highlight-callout'
  | 'faq'

export type FAQItem = {
  question: string
  answer: string
}

export type EditorialPublishValidation =
  | {
      status: 'supported'
      payloadBlock: PayloadContentBlock
      correctedMarkdown: string
      mappedPayloadBlockType: SupportedPayloadBlockType
    }
  | {
      status: 'invalid'
      message: string
      correctedMarkdown: string
    }
  | {
      status: 'unsupported'
      message: string
    }

export type EditorialPublishAnalysis = {
  byId: Record<string, EditorialPublishValidation>
  blockingBlocks: Array<{ blockId: string; message: string }>
  hasBlockingBlocks: boolean
}

export function extractEditorialBlocks(markdown: string): {
  bodyMarkdown: string
  editorialBlocks: EditorialBlock[]
} {
  if (!markdown) {
    return { bodyMarkdown: '', editorialBlocks: [] }
  }

  const lines = markdown.split('\n')
  const editorialBlocks: EditorialBlock[] = []
  const bodyLines: string[] = []
  const startRegex = /^\s*>\s*\[!EDITORIAL-BLOCK-START\|([^\]]+)\]\s*$/i
  const endRegex = /^\s*>\s*\[!EDITORIAL-BLOCK-END\|([^\]]+)\]\s*$/i
  const labelRegex = /^\s*>\s*\[!EDITORIAL-BLOCK-LABEL\|([^\]]+)\]\s*$/i

  let index = 0
  while (index < lines.length) {
    const startMatch = lines[index].match(startRegex)
    if (!startMatch) {
      bodyLines.push(lines[index])
      index++
      continue
    }

    const component = startMatch[1].trim()
    const blockLines = [lines[index]]
    let label = component
    let cursor = index + 1
    let foundEnd = false

    while (cursor < lines.length) {
      const line = lines[cursor]
      blockLines.push(line)

      const labelMatch = line.match(labelRegex)
      if (labelMatch && labelMatch[1]?.trim()) {
        label = labelMatch[1].trim()
      }

      const endMatch = line.match(endRegex)
      if (
        endMatch
        && endMatch[1]?.trim().toLowerCase() === component.toLowerCase()
      ) {
        foundEnd = true
        break
      }

      cursor++
    }

    if (!foundEnd) {
      bodyLines.push(...blockLines)
      index = cursor + 1
      continue
    }

    const blockMarkdown = blockLines.join('\n').trim()
    if (!getEditorialBlockBody(blockMarkdown)) {
      index = cursor + 1
      continue
    }

    editorialBlocks.push({
      id: `editorial_${index}_${editorialBlocks.length}`,
      component,
      label,
      markdown: blockMarkdown,
      anchorLine: bodyLines.length,
      afterBlockId: null,
      placeAfterImage: false,
    })

    index = cursor + 1
  }

  return {
    bodyMarkdown: bodyLines.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    editorialBlocks,
  }
}

export function normalizeEditorialBlocks(
  blocks: EditorialBlock[] | undefined
): EditorialBlock[] {
  if (!blocks || !Array.isArray(blocks)) return []

  return blocks
    .map((block, index) => ({
      id: block.id || `editorial_${index}`,
      component: block.component || 'unknown',
      label: block.label || block.component || 'Editorial Block',
      markdown: block.markdown || '',
      anchorLine:
        typeof block.anchorLine === 'number' ? block.anchorLine : undefined,
      afterBlockId:
        typeof block.afterBlockId === 'string' || block.afterBlockId === null
          ? block.afterBlockId
          : undefined,
      placeAfterImage: block.placeAfterImage === true,
    }))
    .filter((block) => block.markdown.trim().length > 0)
}

export function normalizeEditorialComponentKey(component: string): string {
  const normalized = component.trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (
    normalized === 'pull_quote'
    || normalized === 'pullquote'
    || normalized === 'quote'
  ) {
    return PULL_QUOTE_COMPONENT
  }
  if (
    normalized === 'key_takeaway'
    || normalized === 'key_takeaways'
    || normalized === 'takeaways'
    || normalized === 'key_takeaway_box'
    || normalized === 'key_takeaways_box'
  ) {
    return KEY_TAKEAWAYS_COMPONENT
  }
  if (
    normalized === 'in_the_know'
    || normalized === 'in_theknow'
    || normalized === 'in_the_know_box'
    || normalized === 'in_theknow_box'
    || normalized === 'in_the_know_callout'
  ) {
    return IN_THE_KNOW_COMPONENT
  }
  if (
    normalized === 'highlight_callout'
    || normalized === 'highlight'
    || normalized === 'highlight_box'
    || normalized === 'highlight_callout_box'
    || normalized === 'highlightcallout'
  ) {
    return HIGHLIGHT_CALLOUT_COMPONENT
  }
  if (
    normalized === 'faq_block'
    || normalized === 'faq'
    || normalized === 'faqs'
    || normalized === 'frequently_asked_questions'
    || normalized === 'qa_block'
    || normalized === 'q_and_a_block'
    || normalized === 'qanda_block'
  ) {
    return FAQ_COMPONENT
  }
  return normalized
}

function parseEditorialFrame(
  block: EditorialBlock,
  expectedComponent: string
): {
  label: string
  bodyLines: string[]
  hasStartMarker: boolean
  hasEndMarker: boolean
  hasLabelMarker: boolean
  hasBoxMarker: boolean
  hasComponentLine: boolean
} {
  const lines = block.markdown
    .split('\n')
    .map((line) => line.replace(/^\s*>\s?/, '').trim())

  let hasStartMarker = false
  let hasEndMarker = false
  let hasLabelMarker = false
  let hasBoxMarker = false
  let hasComponentLine = false
  let labelFromMarker = ''
  const bodyLines: string[] = []

  lines.forEach((line) => {
    if (!line) return

    const startMatch = line.match(/^\[!EDITORIAL-BLOCK-START\|([^\]]+)\]$/i)
    if (startMatch) {
      hasStartMarker = normalizeEditorialComponentKey(startMatch[1]) === expectedComponent
      return
    }

    const endMatch = line.match(/^\[!EDITORIAL-BLOCK-END\|([^\]]+)\]$/i)
    if (endMatch) {
      hasEndMarker = normalizeEditorialComponentKey(endMatch[1]) === expectedComponent
      return
    }

    const labelMatch = line.match(/^\[!EDITORIAL-BLOCK-LABEL\|([^\]]*)\]\s*(.*)$/i)
    if (labelMatch) {
      hasLabelMarker = true
      const capturedLabel = labelMatch[1].trim()
      if (capturedLabel) {
        labelFromMarker = capturedLabel
      }
      const trailingText = labelMatch[2]?.trim()
      if (trailingText) {
        bodyLines.push(trailingText)
      }
      return
    }

    const boxMatch = line.match(/^\[!EDITORIAL-BOX\|([^\]]+)\]$/i)
    if (boxMatch) {
      hasBoxMarker = normalizeEditorialComponentKey(boxMatch[1]) === expectedComponent
      return
    }

    if (/^\*\*Component:\*\*/i.test(line)) {
      hasComponentLine = true
      return
    }

    bodyLines.push(line)
  })

  return {
    label: labelFromMarker || block.label,
    bodyLines,
    hasStartMarker,
    hasEndMarker,
    hasLabelMarker,
    hasBoxMarker,
    hasComponentLine,
  }
}

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

export function buildDefaultEditorialTemplate(
  component: SupportedEditorialComponent
): {
  label: string
  markdown: string
} {
  if (component === PULL_QUOTE_COMPONENT) {
    return {
      label: PULL_QUOTE_LABEL,
      markdown: buildCanonicalPullQuoteMarkdown(PULL_QUOTE_LABEL, ''),
    }
  }

  if (component === IN_THE_KNOW_COMPONENT) {
    return {
      label: IN_THE_KNOW_LABEL,
      markdown: buildCanonicalInTheKnowMarkdown(IN_THE_KNOW_LABEL, ''),
    }
  }

  if (component === HIGHLIGHT_CALLOUT_COMPONENT) {
    return {
      label: HIGHLIGHT_CALLOUT_LABEL,
      markdown: buildCanonicalHighlightCalloutMarkdown(HIGHLIGHT_CALLOUT_LABEL, ''),
    }
  }

  if (component === FAQ_COMPONENT) {
    return {
      label: FAQ_LABEL,
      markdown: buildCanonicalFAQMarkdown(FAQ_LABEL, []),
    }
  }

  return {
    label: KEY_TAKEAWAYS_LABEL,
    markdown: buildCanonicalKeyTakeawaysMarkdown(KEY_TAKEAWAYS_LABEL, []),
  }
}

export function parseKeyTakeawayEditorialBlock(block: EditorialBlock): {
  label: string
  rawItems: string[]
  items: string[]
  hasStartMarker: boolean
  hasEndMarker: boolean
  hasLabelMarker: boolean
  hasBoxMarker: boolean
  hasComponentLine: boolean
  correctedMarkdown: string
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
  const correctedMarkdown = buildCanonicalKeyTakeawaysMarkdown(label, items)

  return {
    label,
    rawItems,
    items,
    hasStartMarker: frame.hasStartMarker,
    hasEndMarker: frame.hasEndMarker,
    hasLabelMarker: frame.hasLabelMarker,
    hasBoxMarker: frame.hasBoxMarker,
    hasComponentLine: frame.hasComponentLine,
    correctedMarkdown,
  }
}

export function parsePullQuoteEditorialBlock(block: EditorialBlock): {
  label: string
  quoteText: string
  hasStartMarker: boolean
  hasEndMarker: boolean
  hasLabelMarker: boolean
  hasBoxMarker: boolean
  hasComponentLine: boolean
  correctedMarkdown: string
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
  const correctedMarkdown = buildCanonicalPullQuoteMarkdown(label, quoteText)

  return {
    label,
    quoteText,
    hasStartMarker: frame.hasStartMarker,
    hasEndMarker: frame.hasEndMarker,
    hasLabelMarker: frame.hasLabelMarker,
    hasBoxMarker: frame.hasBoxMarker,
    hasComponentLine: frame.hasComponentLine,
    correctedMarkdown,
  }
}

export function parseInTheKnowEditorialBlock(block: EditorialBlock): {
  label: string
  text: string
  hasStartMarker: boolean
  hasEndMarker: boolean
  hasLabelMarker: boolean
  hasBoxMarker: boolean
  hasComponentLine: boolean
  correctedMarkdown: string
} {
  const frame = parseEditorialFrame(block, IN_THE_KNOW_COMPONENT)
  const text = frame.bodyLines
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim()
  const label = frame.label || IN_THE_KNOW_LABEL
  const correctedMarkdown = buildCanonicalInTheKnowMarkdown(label, text)

  return {
    label,
    text,
    hasStartMarker: frame.hasStartMarker,
    hasEndMarker: frame.hasEndMarker,
    hasLabelMarker: frame.hasLabelMarker,
    hasBoxMarker: frame.hasBoxMarker,
    hasComponentLine: frame.hasComponentLine,
    correctedMarkdown,
  }
}

export function parseHighlightCalloutEditorialBlock(block: EditorialBlock): {
  label: string
  text: string
  hasStartMarker: boolean
  hasEndMarker: boolean
  hasLabelMarker: boolean
  hasBoxMarker: boolean
  hasComponentLine: boolean
  correctedMarkdown: string
} {
  const frame = parseEditorialFrame(block, HIGHLIGHT_CALLOUT_COMPONENT)
  const text = frame.bodyLines
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim()
  const label = frame.label || HIGHLIGHT_CALLOUT_LABEL
  const correctedMarkdown = buildCanonicalHighlightCalloutMarkdown(label, text)

  return {
    label,
    text,
    hasStartMarker: frame.hasStartMarker,
    hasEndMarker: frame.hasEndMarker,
    hasLabelMarker: frame.hasLabelMarker,
    hasBoxMarker: frame.hasBoxMarker,
    hasComponentLine: frame.hasComponentLine,
    correctedMarkdown,
  }
}

function normalizeFAQContentLine(line: string): string {
  return line
    .trim()
    .replace(/^[-*+]\s+/, '')
    .replace(/^\d+\.\s+/, '')
    .replace(/^#{1,6}\s+/, '')
    .trim()
}

function stripFAQInlineFormatting(line: string): string {
  return line
    .trim()
    .replace(/^\*\*((?:q|question|a|answer)(?:\s*\d+)?)\s*:\*\*\s*/i, '$1: ')
    .replace(/^__((?:q|question|a|answer)(?:\s*\d+)?)\s*:__\s*/i, '$1: ')
    .replace(/^\*\*(.+)\*\*$/, '$1')
    .replace(/^__(.+)__$/, '$1')
    .trim()
}

function extractFAQQuestionText(line: string): string | null {
  const normalizedLine = stripFAQInlineFormatting(normalizeFAQContentLine(line))
  const labeledQuestion = normalizedLine.match(
    /^(?:q|question)(?:\s*\d+)?\s*:\s*(.+)$/i
  )
  if (labeledQuestion) {
    return labeledQuestion[1].trim() || null
  }
  return /\?$/.test(normalizedLine) ? normalizedLine : null
}

function extractFAQAnswerText(line: string): string | null {
  const normalizedLine = stripFAQInlineFormatting(normalizeFAQContentLine(line))
  const labeledAnswer = normalizedLine.match(
    /^(?:a|answer)(?:\s*\d+)?\s*:\s*(.+)$/i
  )
  if (labeledAnswer) {
    return labeledAnswer[1].trim() || null
  }
  return null
}

export function parseFAQEditorialBlock(block: EditorialBlock): {
  label: string
  items: FAQItem[]
  hasStartMarker: boolean
  hasEndMarker: boolean
  hasLabelMarker: boolean
  hasBoxMarker: boolean
  hasComponentLine: boolean
  correctedMarkdown: string
} {
  const frame = parseEditorialFrame(block, FAQ_COMPONENT)
  const lines = frame.bodyLines
    .map(normalizeFAQContentLine)
    .filter((line) => (
      Boolean(line)
      && !/^(placement|why)\s*:/i.test(line)
      && !/^\*\*(placement|why):\*\*/i.test(line)
    ))

  let items: FAQItem[] = []
  let currentQuestion = ''
  let currentAnswerLines: string[] = []

  const pushCurrentItem = () => {
    const question = currentQuestion.trim()
    const answer = currentAnswerLines.join(' ').trim()
    if (question && answer) {
      items.push({ question, answer })
    }
    currentQuestion = ''
    currentAnswerLines = []
  }

  lines.forEach((line) => {
    const normalizedLine = line.replace(/^\s*>\s?/, '').trim()
    const normalizedText = stripFAQInlineFormatting(normalizedLine)
    const questionText = extractFAQQuestionText(normalizedLine)
    if (questionText) {
      pushCurrentItem()
      currentQuestion = questionText
      return
    }

    const answerText = extractFAQAnswerText(normalizedLine)
    if (answerText) {
      if (!currentQuestion) {
        currentQuestion = 'Add FAQ question?'
      }
      currentAnswerLines.push(answerText)
      return
    }

    const sameLineQA = normalizedText.match(/^(.+\?)\s+(.+)$/)
    if (sameLineQA) {
      pushCurrentItem()
      items.push({
        question: sameLineQA[1].trim(),
        answer: sameLineQA[2].trim(),
      })
      return
    }

    if (currentQuestion) {
      currentAnswerLines.push(normalizedText)
    }
  })

  pushCurrentItem()

  if (items.length < 2) {
    const fallbackItems: FAQItem[] = []

    for (let index = 0; index < lines.length; index += 1) {
      const question = extractFAQQuestionText(lines[index])
      if (!question) continue

      const nextLine = lines[index + 1]
      if (!nextLine) continue

      const answer = extractFAQAnswerText(nextLine) || stripFAQInlineFormatting(nextLine)
      if (!answer || extractFAQQuestionText(nextLine)) continue

      fallbackItems.push({
        question,
        answer,
      })
      index += 1
    }

    if (fallbackItems.length > items.length) {
      items = fallbackItems
    }
  }

  const label = frame.label || FAQ_LABEL
  const correctedMarkdown = buildCanonicalFAQMarkdown(label, items)

  return {
    label,
    items,
    hasStartMarker: frame.hasStartMarker,
    hasEndMarker: frame.hasEndMarker,
    hasLabelMarker: frame.hasLabelMarker,
    hasBoxMarker: frame.hasBoxMarker,
    hasComponentLine: frame.hasComponentLine,
    correctedMarkdown,
  }
}

export function validateEditorialBlockForPublish(block: EditorialBlock): EditorialPublishValidation {
  const component = normalizeEditorialComponentKey(block.component)

  if (component === KEY_TAKEAWAYS_COMPONENT) {
    const parsed = parseKeyTakeawayEditorialBlock(block)
    const missingParts: string[] = []

    if (!parsed.hasStartMarker) missingParts.push('start marker')
    if (!parsed.hasLabelMarker) missingParts.push('label marker')
    if (!parsed.hasBoxMarker) missingParts.push('box marker')
    if (!parsed.hasComponentLine) missingParts.push('component line')
    if (!parsed.hasEndMarker) missingParts.push('end marker')
    if (parsed.items.length === 0) missingParts.push('takeaway bullets')

    if (missingParts.length > 0) {
      return {
        status: 'invalid',
        message: `Block markdown incorrect (${missingParts.join(', ')})`,
        correctedMarkdown: parsed.correctedMarkdown,
      }
    }

    return {
      status: 'supported',
      payloadBlock: {
        blockType: 'key-takeaway',
        label: parsed.label,
        items: parsed.items.slice(0, 5).map((text) => ({ text })),
      },
      correctedMarkdown: parsed.correctedMarkdown,
      mappedPayloadBlockType: 'key-takeaway',
    }
  }

  if (component === PULL_QUOTE_COMPONENT) {
    const parsed = parsePullQuoteEditorialBlock(block)
    const missingParts: string[] = []

    if (!parsed.hasStartMarker) missingParts.push('start marker')
    if (!parsed.hasLabelMarker) missingParts.push('label marker')
    if (!parsed.hasBoxMarker) missingParts.push('box marker')
    if (!parsed.hasComponentLine) missingParts.push('component line')
    if (!parsed.hasEndMarker) missingParts.push('end marker')
    if (!parsed.quoteText) missingParts.push('quote text')

    if (missingParts.length > 0) {
      return {
        status: 'invalid',
        message: `Block markdown incorrect (${missingParts.join(', ')})`,
        correctedMarkdown: parsed.correctedMarkdown,
      }
    }

    return {
      status: 'supported',
      payloadBlock: {
        blockType: 'pull-quote',
        quote: parsed.quoteText,
      },
      correctedMarkdown: parsed.correctedMarkdown,
      mappedPayloadBlockType: 'pull-quote',
    }
  }

  if (component === IN_THE_KNOW_COMPONENT) {
    const parsed = parseInTheKnowEditorialBlock(block)
    const missingParts: string[] = []

    if (!parsed.hasStartMarker) missingParts.push('start marker')
    if (!parsed.hasLabelMarker) missingParts.push('label marker')
    if (!parsed.hasBoxMarker) missingParts.push('box marker')
    if (!parsed.hasComponentLine) missingParts.push('component line')
    if (!parsed.hasEndMarker) missingParts.push('end marker')
    if (!parsed.text) missingParts.push('text')

    if (missingParts.length > 0) {
      return {
        status: 'invalid',
        message: `Block markdown incorrect (${missingParts.join(', ')})`,
        correctedMarkdown: parsed.correctedMarkdown,
      }
    }

    return {
      status: 'supported',
      payloadBlock: {
        blockType: 'in-the-know',
        label: parsed.label,
        text: parsed.text,
      },
      correctedMarkdown: parsed.correctedMarkdown,
      mappedPayloadBlockType: 'in-the-know',
    }
  }

  if (component === HIGHLIGHT_CALLOUT_COMPONENT) {
    const parsed = parseHighlightCalloutEditorialBlock(block)
    const missingParts: string[] = []

    if (!parsed.hasStartMarker) missingParts.push('start marker')
    if (!parsed.hasLabelMarker) missingParts.push('label marker')
    if (!parsed.hasBoxMarker) missingParts.push('box marker')
    if (!parsed.hasComponentLine) missingParts.push('component line')
    if (!parsed.hasEndMarker) missingParts.push('end marker')
    if (!parsed.text) missingParts.push('text')

    if (missingParts.length > 0) {
      return {
        status: 'invalid',
        message: `Block markdown incorrect (${missingParts.join(', ')})`,
        correctedMarkdown: parsed.correctedMarkdown,
      }
    }

    return {
      status: 'supported',
      payloadBlock: {
        blockType: 'highlight-callout',
        label: parsed.label,
        text: parsed.text,
      },
      correctedMarkdown: parsed.correctedMarkdown,
      mappedPayloadBlockType: 'highlight-callout',
    }
  }

  if (component === FAQ_COMPONENT) {
    const parsed = parseFAQEditorialBlock(block)
    const missingParts: string[] = []

    if (!parsed.hasStartMarker) missingParts.push('start marker')
    if (!parsed.hasLabelMarker) missingParts.push('label marker')
    if (!parsed.hasBoxMarker) missingParts.push('box marker')
    if (!parsed.hasComponentLine) missingParts.push('component line')
    if (!parsed.hasEndMarker) missingParts.push('end marker')
    if (parsed.items.length < 2) missingParts.push('at least two FAQ items')

    if (missingParts.length > 0) {
      return {
        status: 'invalid',
        message: `Block markdown incorrect (${missingParts.join(', ')})`,
        correctedMarkdown: parsed.correctedMarkdown,
      }
    }

    return {
      status: 'supported',
      payloadBlock: {
        blockType: 'faq',
        label: parsed.label,
        items: parsed.items.slice(0, EDITORIAL_MAX_FAQ_ITEMS),
      },
      correctedMarkdown: parsed.correctedMarkdown,
      mappedPayloadBlockType: 'faq',
    }
  }

  return {
    status: 'unsupported',
    message: `Unsupported editorial block component: ${block.component}`,
  }
}

export function buildEditorialPublishAnalysis(
  editorialBlocks: EditorialBlock[]
): EditorialPublishAnalysis {
  const byId: Record<string, EditorialPublishValidation> = {}
  const blockingBlocks: Array<{ blockId: string; message: string }> = []

  editorialBlocks.forEach((block) => {
    const validation = validateEditorialBlockForPublish(block)
    byId[block.id] = validation

    if (validation.status !== 'supported') {
      blockingBlocks.push({
        blockId: block.id,
        message: `${block.label}: ${validation.message}`,
      })
    }
  })

  return {
    byId,
    blockingBlocks,
    hasBlockingBlocks: blockingBlocks.length > 0,
  }
}

export function getEditorialBlockBody(markdown: string): string {
  const lines = markdown.split('\n')
  const cleaned = lines
    .map((line) => line.replace(/^\s*>\s?/, ''))
    .filter((line) => {
      const trimmed = line.trim()
      if (!trimmed) return true
      if (/^\[!EDITORIAL-BLOCK-START\|/i.test(trimmed)) return false
      if (/^\[!EDITORIAL-BLOCK-END\|/i.test(trimmed)) return false
      if (/^\[!EDITORIAL-BLOCK-LABEL\|/i.test(trimmed)) return false
      if (/^\[!EDITORIAL-BOX\|/i.test(trimmed)) return false
      if (/^\*\*component:\*\*/i.test(trimmed)) return false
      if (/^\*\*(placement|why):\*\*/i.test(trimmed)) return false
      if (/^(placement|why)\s*:/i.test(trimmed)) return false
      return true
    })
    .join('\n')

  return cleaned.trim()
}
