import type { CreateArticlePayload } from '../../api'
import type { EditorialBlock } from '../../types'
import {
  EDITORIAL_MAX_TAKEAWAYS,
  IN_THE_KNOW_COMPONENT,
  IN_THE_KNOW_LABEL,
  KEY_TAKEAWAYS_COMPONENT,
  KEY_TAKEAWAYS_LABEL,
  PULL_QUOTE_COMPONENT,
  PULL_QUOTE_LABEL,
} from './constants'
import type { SupportedEditorialComponent } from './types'

export type PayloadContentBlock = NonNullable<CreateArticlePayload['contentBlocks']>[number]
export type SupportedPayloadBlockType = 'key-takeaway' | 'pull-quote' | 'in-the-know'

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

    editorialBlocks.push({
      id: `editorial_${index}_${editorialBlocks.length}`,
      component,
      label,
      markdown: blockLines.join('\n').trim(),
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

    const labelMatch = line.match(/^\[!EDITORIAL-BLOCK-LABEL\|([^\]]+)\]$/i)
    if (labelMatch) {
      hasLabelMarker = true
      labelFromMarker = labelMatch[1].trim()
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
