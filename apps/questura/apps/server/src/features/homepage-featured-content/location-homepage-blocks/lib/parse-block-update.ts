import { parseArticleGridFourLayoutBodyField } from '../../article-grid/service'
import {
  parseSlot3LayoutBodyField,
  parseSlot4LayoutBodyField,
  parseSlot5LayoutBodyField,
} from '../../featured-articles/lib/slot-layouts'
import { parseLocationGridMediaAspectBodyField } from '../../location-grid/lib/media-aspect'
import {
  homepageBlockSupportsSectionHeading,
  parseSectionHeadingBodyField,
  parseSectionSubheadingBodyField,
} from '../../resolve-page-blocks/lib/section-heading'
import type { RawBlock } from '../../resolve-page-blocks/service'
import { resolveStoredSlotCountForBlockType } from '../../slot-count/service'

type SectionHeadingParse = ReturnType<typeof parseSectionHeadingBodyField>
type SectionSubheadingParse = ReturnType<typeof parseSectionSubheadingBodyField>
type Slot3LayoutParse = ReturnType<typeof parseSlot3LayoutBodyField>
type Slot4LayoutParse = ReturnType<typeof parseSlot4LayoutBodyField>
type Slot5LayoutParse = ReturnType<typeof parseSlot5LayoutBodyField>
type MediaAspectParse = ReturnType<typeof parseLocationGridMediaAspectBodyField>
type ArticleGridFourLayoutParse = ReturnType<typeof parseArticleGridFourLayoutBodyField>

export type ParsedBlockUpdateFields = {
  sectionHeading: Extract<SectionHeadingParse, { ok: true }>
  sectionSubheading: Extract<SectionSubheadingParse, { ok: true }>
  slot3Layout: Extract<Slot3LayoutParse, { ok: true }>
  slot4Layout: Extract<Slot4LayoutParse, { ok: true }>
  slot5Layout: Extract<Slot5LayoutParse, { ok: true }>
  mediaAspect: Extract<MediaAspectParse, { ok: true }>
  articleGridFourLayout: Extract<ArticleGridFourLayoutParse, { ok: true }>
}

export type ParsedBlockUpdateInput = {
  blockId: string
  hasItems: boolean
  items: unknown[]
  slotCount: number | null
  fields: ParsedBlockUpdateFields
}

type ParseBlockUpdateResult =
  | { ok: true; input: ParsedBlockUpdateInput }
  | { ok: false; status: number; message: string }

export function parseBlockUpdateBody(body: unknown): ParseBlockUpdateResult {
  const bodyRecord = body && typeof body === 'object' ? (body as Record<string, unknown>) : null

  if (!bodyRecord?.blockId || typeof bodyRecord.blockId !== 'string') {
    return { ok: false, status: 400, message: 'blockId (string) is required.' }
  }

  const sectionHeading = parseSectionHeadingBodyField(bodyRecord)
  if (!sectionHeading.ok) {
    return { ok: false, status: 400, message: sectionHeading.message }
  }

  const sectionSubheading = parseSectionSubheadingBodyField(bodyRecord)
  if (!sectionSubheading.ok) {
    return { ok: false, status: 400, message: sectionSubheading.message }
  }

  const slot3Layout = parseSlot3LayoutBodyField(bodyRecord)
  if (!slot3Layout.ok) {
    return { ok: false, status: 400, message: slot3Layout.message }
  }

  const slot4Layout = parseSlot4LayoutBodyField(bodyRecord)
  if (!slot4Layout.ok) {
    return { ok: false, status: 400, message: slot4Layout.message }
  }

  const slot5Layout = parseSlot5LayoutBodyField(bodyRecord)
  if (!slot5Layout.ok) {
    return { ok: false, status: 400, message: slot5Layout.message }
  }

  const mediaAspect = parseLocationGridMediaAspectBodyField(bodyRecord)
  if (!mediaAspect.ok) {
    return { ok: false, status: 400, message: mediaAspect.message }
  }

  const articleGridFourLayout = parseArticleGridFourLayoutBodyField(bodyRecord)
  if (!articleGridFourLayout.ok) {
    return { ok: false, status: 400, message: articleGridFourLayout.message }
  }

  const fields = {
    sectionHeading,
    sectionSubheading,
    slot3Layout,
    slot4Layout,
    slot5Layout,
    mediaAspect,
    articleGridFourLayout,
  }
  const rawItems = bodyRecord.items
  const hasItems = Array.isArray(rawItems)
  const items = hasItems ? rawItems : []
  const rawSlotCount = bodyRecord.slotCount
  const slotCount =
    typeof rawSlotCount === 'number' && Number.isInteger(rawSlotCount)
      ? rawSlotCount
      : null

  if (rawSlotCount !== undefined && slotCount === null) {
    return { ok: false, status: 400, message: 'slotCount must be an integer when provided.' }
  }

  if (!hasItems && !hasBlockFieldUpdates(fields)) {
    return {
      ok: false,
      status: 400,
      message:
        'Provide items (array) and/or sectionHeading and/or sectionSubheading and/or slot3Layout and/or slot4Layout and/or slot5Layout and/or mediaAspect and/or articleGridFourLayout to update this block.',
    }
  }

  return {
    ok: true,
    input: {
      blockId: bodyRecord.blockId,
      hasItems,
      items,
      slotCount,
      fields,
    },
  }
}

export function hasBlockFieldUpdates(fields: ParsedBlockUpdateFields): boolean {
  return (
    !fields.sectionHeading.omit
    || !fields.sectionSubheading.omit
    || !fields.slot3Layout.omit
    || !fields.slot4Layout.omit
    || !fields.slot5Layout.omit
    || !fields.mediaAspect.omit
    || !fields.articleGridFourLayout.omit
  )
}

export function validateBlockUpdateFields(
  block: RawBlock,
  fields: ParsedBlockUpdateFields,
): { message: string } | null {
  const blockSlotCount = resolveStoredSlotCountForBlockType(block.blockType, block.slotCount)

  if (!fields.slot3Layout.omit && (block.blockType !== 'featured-articles' || blockSlotCount !== 3)) {
    return { message: 'slot3Layout is only supported for featured-articles blocks with 3 slots.' }
  }

  if (!fields.slot4Layout.omit && (block.blockType !== 'featured-articles' || blockSlotCount !== 4)) {
    return { message: 'slot4Layout is only supported for featured-articles blocks with 4 slots.' }
  }

  if (!fields.slot5Layout.omit && (block.blockType !== 'featured-articles' || blockSlotCount !== 5)) {
    return { message: 'slot5Layout is only supported for featured-articles blocks with 5 slots.' }
  }

  if (!fields.mediaAspect.omit && block.blockType !== 'location-grid') {
    return { message: 'mediaAspect is only supported for location-grid blocks.' }
  }

  if (!fields.articleGridFourLayout.omit) {
    if (block.blockType !== 'article-grid' || blockSlotCount !== 4) {
      return {
        message: 'articleGridFourLayout is only supported for article-grid blocks with 4 slots.',
      }
    }
  }

  if (!fields.sectionHeading.omit && !homepageBlockSupportsSectionHeading(block.blockType)) {
    return { message: 'sectionHeading is not supported for this block type.' }
  }

  if (!fields.sectionSubheading.omit && !homepageBlockSupportsSectionHeading(block.blockType)) {
    return { message: 'sectionSubheading is not supported for this block type.' }
  }

  return null
}
