import { DEFAULT_EDITOR_ASSIST_MODEL } from '../../../staging/api/ai/models'
import type { ListicleItemBlock, PayloadListicleDoc, SingleTypeListicleDraft } from '../../types'

function getRelationshipId(value: unknown): number | null {
  if (typeof value === 'number') return value
  if (typeof value === 'object' && value !== null && 'id' in value) {
    const id = (value as { id?: unknown }).id
    if (typeof id === 'number') return id
  }
  return null
}

export function payloadDocToDraft(doc: PayloadListicleDoc, existingDraftId?: string): SingleTypeListicleDraft {
  const items: ListicleItemBlock[] = (doc.items || []).map((item, index) => ({
    id: item.id || `item_${Date.now()}_${index}`,
    blockType: item.blockType || 'data-dining',
    item: getRelationshipId(item.item),
    blurbMarkdown: '',
    blurbLexical: item.blurb,
    blurbJsonText: item.blurb ? JSON.stringify(item.blurb, null, 2) : '',
  }))

  return {
    draftId: existingDraftId || `stl_payload_${doc.id}`,
    payloadId: doc.id,
    editorModelName: DEFAULT_EDITOR_ASSIST_MODEL,
    title: doc.title || '',
    location: doc.location || '',
    locationRef: getRelationshipId(doc.locationRef),
    listicleType: doc.listicleType || '',
    targetItemCount: doc.targetItemCount || 6,
    step1_complete: Boolean(doc.step1_complete),
    in_update_mode: Boolean(doc.in_update_mode),
    header: {
      customTitle: doc.header?.customTitle || '',
      introMarkdown: '',
      introLexical: doc.header?.intro,
      introJsonText: doc.header?.intro ? JSON.stringify(doc.header.intro, null, 2) : '',
      featuredImage: getRelationshipId(doc.header?.featuredImage),
    },
    items,
    seoSection: {
      seo: getRelationshipId(doc.seoSection?.seo),
    },
    status: doc.status || 'draft',
    articleType: 'single-type-listicle',
    updatedAt: doc.updatedAt || new Date().toISOString(),
  }
}
