import { DEFAULT_EDITOR_ASSIST_MODEL } from '../../../../shared/api/ai/models'
import { getSchemaPublisherConfig } from '../../../../shared/seo/services/schema-publisher-config.service'
import { createEmptySeoSection, normalizeSeoSection } from '../services/seo-section.service'
import type { ListicleItemBlock, PayloadListicleDoc, SingleTypeListicleDraft } from '../../types'
import { resolveListTone, resolveListicleAngleForBlockType } from '../../types'
import { buildPayloadListicleMetadataPatch } from '../services/payload-listicle-metadata.service'
import { getRelationshipId, getRelationshipIds, isMediaMode } from '../../../../shared/builder/utils/item-media.utils'
import { normalizeTargetItemCount } from '../utils/item-target-count.utils'
import { lexicalRichTextToMarkdown } from '../../../../shared/builder/utils/lexical-json.utils'
import { markDraftAsPayloadSynced } from '../../../../shared/payloadSync/draftPayloadSync'
import { buildSingleTypeListicleDraftComparableShape } from '../utils/single-type-listicle-draft-sync-signature'

const schemaPublisherConfig = getSchemaPublisherConfig()

export function payloadDocToDraft(doc: PayloadListicleDoc, existingDraftId?: string): SingleTypeListicleDraft {
  const items: ListicleItemBlock[] = (doc.items || []).map((item, index) => {
    const blockType = item.blockType || 'data-dining'
    return {
      id: item.id || `item_${Date.now()}_${index}`,
      blockType,
      item: getRelationshipId(item.item),
      tours: getRelationshipIds(item.tours),
      mediaMode: isMediaMode(item.mediaMode) ? item.mediaMode : 'photos',
      selectedPhotos: getRelationshipIds(item.selectedPhotos),
      selectedInstagramPost: getRelationshipId(item.selectedInstagramPost),
      blurbMarkdown: item.blurb ? lexicalRichTextToMarkdown(item.blurb) : '',
      blurbLexical: item.blurb,
      blurbJsonText: item.blurb ? JSON.stringify(item.blurb, null, 2) : '',
      angle: resolveListicleAngleForBlockType(blockType, item.angle),
    }
  })

  const fallbackTargetItemCount = typeof doc.targetItemCount === 'number' ? doc.targetItemCount : 0
  const hasStep2Content = Boolean(
    (doc.header?.intro && typeof doc.header.intro === 'object')
    || getRelationshipId(doc.header?.featuredMediaSet)
    || getRelationshipId(doc.header?.featuredImage),
  )
  const hasStep3Content = items.length > 0
  const normalizedSeoSection = normalizeSeoSection(doc.seoSection || createEmptySeoSection())

  const draft: SingleTypeListicleDraft = {
    draftId: existingDraftId || `stl_payload_${doc.id}`,
    ...buildPayloadListicleMetadataPatch({
      doc,
      fallbackAuthorName: schemaPublisherConfig.defaultAuthorName,
    }),
    editorModelName: DEFAULT_EDITOR_ASSIST_MODEL,
    listTone: resolveListTone(doc.listTone),
    title: doc.title || '',
    location: doc.location || '',
    locationRef: getRelationshipId(doc.locationRef),
    sharedNeighborhoods: getRelationshipIds(doc.sharedNeighborhoods),
    listicleType: doc.listicleType || '',
    targetItemCount: normalizeTargetItemCount(fallbackTargetItemCount, items),
    step1_complete: Boolean(doc.step1_complete),
    in_update_mode: Boolean(doc.in_update_mode),
    step2_complete: Boolean(doc.step2_complete) || hasStep2Content,
    step2_in_update_mode: Boolean(doc.step2_in_update_mode),
    step3_complete: Boolean(doc.step3_complete) || hasStep3Content,
    step3_in_update_mode: Boolean(doc.step3_in_update_mode),
    header: {
      introMarkdown: doc.header?.intro ? lexicalRichTextToMarkdown(doc.header.intro) : '',
      introLexical: doc.header?.intro,
      introJsonText: doc.header?.intro ? JSON.stringify(doc.header.intro, null, 2) : '',
      featuredMediaSet: getRelationshipId(doc.header?.featuredMediaSet),
      featuredImage: getRelationshipId(doc.header?.featuredImage),
    },
    items,
    seoSection: normalizedSeoSection,
    status: doc.status || 'draft',
    articleType: 'single-type-listicle',
    updatedAt: doc.updatedAt || new Date().toISOString(),
  }

  return markDraftAsPayloadSynced(
    draft,
    buildSingleTypeListicleDraftComparableShape,
    doc.updatedAt || new Date().toISOString(),
  )
}
