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
import type {
  EditorialPublishValidation,
  PayloadContentBlock,
  SupportedPayloadBlockType,
} from './editorial-publish.types'

type ParsedEditorialFrame = {
  hasStartMarker: boolean
  hasLabelMarker: boolean
  hasBoxMarker: boolean
  hasComponentLine: boolean
  hasEndMarker: boolean
  correctedMarkdown: string
}

type EditorialBlockValidationStrategy = (
  block: EditorialBlock
) => EditorialPublishValidation

type SupportedValidationParts = {
  payloadBlock: PayloadContentBlock
  mappedPayloadBlockType: SupportedPayloadBlockType
}

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

function validateParsedEditorialBlock<TParsed extends ParsedEditorialFrame>(
  parsed: TParsed,
  getMissingContentParts: (parsed: TParsed) => string[],
  buildSupportedParts: (parsed: TParsed) => SupportedValidationParts
): EditorialPublishValidation {
  const missingParts = [
    ...getMissingFrameParts(parsed),
    ...getMissingContentParts(parsed),
  ]

  if (missingParts.length > 0) {
    return buildInvalidValidation(missingParts, parsed.correctedMarkdown)
  }

  return {
    status: 'supported',
    correctedMarkdown: parsed.correctedMarkdown,
    ...buildSupportedParts(parsed),
  }
}

const editorialBlockValidationStrategies: Record<string, EditorialBlockValidationStrategy> = {
  [KEY_TAKEAWAYS_COMPONENT]: (block) =>
    validateParsedEditorialBlock(
      parseKeyTakeawayEditorialBlock(block),
      (parsed) => (parsed.items.length === 0 ? ['takeaway bullets'] : []),
      (parsed) => ({
        payloadBlock: {
          blockType: 'key-takeaway',
          label: parsed.label,
          items: parsed.items.slice(0, 5).map((text) => ({ text })),
        },
        mappedPayloadBlockType: 'key-takeaway',
      })
    ),
  [PULL_QUOTE_COMPONENT]: (block) =>
    validateParsedEditorialBlock(
      parsePullQuoteEditorialBlock(block),
      (parsed) => (!parsed.quoteText ? ['quote text'] : []),
      (parsed) => ({
        payloadBlock: {
          blockType: 'pull-quote',
          quote: parsed.quoteText,
        },
        mappedPayloadBlockType: 'pull-quote',
      })
    ),
  [IN_THE_KNOW_COMPONENT]: (block) =>
    validateParsedEditorialBlock(
      parseInTheKnowEditorialBlock(block),
      (parsed) => (!parsed.text ? ['text'] : []),
      (parsed) => ({
        payloadBlock: {
          blockType: 'in-the-know',
          label: parsed.label,
          text: parsed.text,
        },
        mappedPayloadBlockType: 'in-the-know',
      })
    ),
  [HIGHLIGHT_CALLOUT_COMPONENT]: (block) =>
    validateParsedEditorialBlock(
      parseHighlightCalloutEditorialBlock(block),
      (parsed) => (!parsed.text ? ['text'] : []),
      (parsed) => ({
        payloadBlock: {
          blockType: 'highlight-callout',
          label: parsed.label,
          text: parsed.text,
        },
        mappedPayloadBlockType: 'highlight-callout',
      })
    ),
  [FAQ_COMPONENT]: (block) =>
    validateParsedEditorialBlock(
      parseFAQEditorialBlock(block),
      (parsed) => (parsed.items.length < 2 ? ['at least two FAQ items'] : []),
      (parsed) => ({
        payloadBlock: {
          blockType: 'faq',
          label: parsed.label,
          items: parsed.items.slice(0, EDITORIAL_MAX_FAQ_ITEMS),
        },
        mappedPayloadBlockType: 'faq',
      })
    ),
}

export function validateEditorialBlockForPublish(block: EditorialBlock): EditorialPublishValidation {
  const component = normalizeEditorialComponentKey(block.component)
  const strategy = editorialBlockValidationStrategies[component]

  if (strategy) return strategy(block)

  return {
    status: 'unsupported',
    message: `Unsupported editorial block component: ${block.component}`,
  }
}
