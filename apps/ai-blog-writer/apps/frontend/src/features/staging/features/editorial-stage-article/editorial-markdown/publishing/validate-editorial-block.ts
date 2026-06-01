import type { EditorialBlock } from '../../../../types'
import {
  EDITORIAL_MAX_FAQ_ITEMS,
  FAQ_COMPONENT,
  HIGHLIGHT_CALLOUT_COMPONENT,
  IN_THE_KNOW_COMPONENT,
  KEY_TAKEAWAYS_COMPONENT,
  PULL_QUOTE_COMPONENT,
} from '../../constants'
import { normalizeEditorialComponentKey } from '../component-key'
import { parseFAQEditorialBlock } from '../parsing/faq-block-parser'
import {
  parseHighlightCalloutEditorialBlock,
  parseInTheKnowEditorialBlock,
  parseKeyTakeawayEditorialBlock,
  parsePullQuoteEditorialBlock,
} from '../parsing/standard-block-parsers'
import type { EditorialPublishValidation } from './editorial-publish.types'

function getMissingFrameParts(parsed: {
  hasStartMarker: boolean
  hasLabelMarker: boolean
  hasBoxMarker: boolean
  hasComponentLine: boolean
  hasEndMarker: boolean
}): string[] {
  const missingParts: string[] = []
  if (!parsed.hasStartMarker) missingParts.push('start marker')
  if (!parsed.hasLabelMarker) missingParts.push('label marker')
  if (!parsed.hasBoxMarker) missingParts.push('box marker')
  if (!parsed.hasComponentLine) missingParts.push('component line')
  if (!parsed.hasEndMarker) missingParts.push('end marker')
  return missingParts
}

function buildInvalidValidation(
  missingParts: string[],
  correctedMarkdown: string
): EditorialPublishValidation {
  return {
    status: 'invalid',
    message: `Block markdown incorrect (${missingParts.join(', ')})`,
    correctedMarkdown,
  }
}

export function validateEditorialBlockForPublish(block: EditorialBlock): EditorialPublishValidation {
  const component = normalizeEditorialComponentKey(block.component)

  if (component === KEY_TAKEAWAYS_COMPONENT) {
    const parsed = parseKeyTakeawayEditorialBlock(block)
    const missingParts = getMissingFrameParts(parsed)
    if (parsed.items.length === 0) missingParts.push('takeaway bullets')

    if (missingParts.length > 0) {
      return buildInvalidValidation(missingParts, parsed.correctedMarkdown)
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
    const missingParts = getMissingFrameParts(parsed)
    if (!parsed.quoteText) missingParts.push('quote text')

    if (missingParts.length > 0) {
      return buildInvalidValidation(missingParts, parsed.correctedMarkdown)
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
    const missingParts = getMissingFrameParts(parsed)
    if (!parsed.text) missingParts.push('text')

    if (missingParts.length > 0) {
      return buildInvalidValidation(missingParts, parsed.correctedMarkdown)
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
    const missingParts = getMissingFrameParts(parsed)
    if (!parsed.text) missingParts.push('text')

    if (missingParts.length > 0) {
      return buildInvalidValidation(missingParts, parsed.correctedMarkdown)
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
    const missingParts = getMissingFrameParts(parsed)
    if (parsed.items.length < 2) missingParts.push('at least two FAQ items')

    if (missingParts.length > 0) {
      return buildInvalidValidation(missingParts, parsed.correctedMarkdown)
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
