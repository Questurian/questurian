import { createListicle, getBlockTypeForListicleType, markdownToLexical, updateListicle } from '../../api'
import { getSchemaPublisherConfig } from '../../../../shared/seo/services/schema-publisher-config.service'
import { buildSeoPayload } from './seo-section.service'
import type { PayloadListicleDoc, RelatedItemOption, SingleTypeListicleDraft } from '../../types'
import { payloadDocToDraft } from '../mappers/listicle-draft.mapper'
import { buildPayloadListicleMetadataPatch } from './payload-listicle-metadata.service'
import {
  buildSingleTypeListicleStructuredDataTemplate,
  serializeStructuredDataTemplate,
} from './structured-data-template.service'
import { requiresInstagram, requiresPhotos } from '../../../../shared/builder/utils/item-media.utils'
import { readLexicalFromJsonText } from '../../../../shared/builder/utils/lexical-json.utils'
import { validateSubmit } from '../validators/submit.validators'
import { markDraftAsPayloadSynced } from '../../../../shared/payloadSync/draftPayloadSync'
import { buildSingleTypeListicleDraftComparableShape } from '../utils/single-type-listicle-draft-sync-signature'

export type SubmitListicleParams = {
  draft: SingleTypeListicleDraft
  selectedLocationRefId: number | null
  targetStatus: 'draft' | 'published'
  relatedItems: RelatedItemOption[]
}

export async function submitListicle({
  draft,
  selectedLocationRefId,
  targetStatus,
  relatedItems,
}: SubmitListicleParams): Promise<{ doc: PayloadListicleDoc; nextDraft: SingleTypeListicleDraft; resultMessage: string }> {
  const submitIssue = validateSubmit(draft, selectedLocationRefId, targetStatus, relatedItems)
  if (submitIssue) throw new Error(submitIssue)
  const schemaPublisherConfig = getSchemaPublisherConfig()

  const headerIntro = draft.header.introMarkdown.trim()
    ? await markdownToLexical(draft.header.introMarkdown)
    : readLexicalFromJsonText(draft.header.introJsonText || '', 'Header intro')

  if (!draft.header.introMarkdown.trim() && !draft.header.introJsonText?.trim()) {
    throw new Error('Header intro is required (markdown or lexical JSON)')
  }

  const payloadItems = [] as Array<Record<string, unknown>>
  for (let index = 0; index < draft.items.length; index += 1) {
    const item = draft.items[index]
    if (!item.item) {
      throw new Error(`Item ${index + 1} is missing related entry selection`)
    }

    const blurb = item.blurbMarkdown.trim()
      ? await markdownToLexical(item.blurbMarkdown)
      : readLexicalFromJsonText(item.blurbJsonText || '', `Item ${index + 1} blurb`)

    if (!item.blurbMarkdown.trim() && !item.blurbJsonText?.trim()) {
      throw new Error(`Item ${index + 1} blurb is required (markdown or lexical JSON)`)
    }

    payloadItems.push({
      blockType: item.blockType,
      item: item.item,
      // Tour Picks ride only on attraction items (ADR 0013).
      ...(item.blockType === 'data-attractions' ? { tours: item.tours } : {}),
      mediaMode: item.mediaMode,
      selectedPhotos: requiresPhotos(item.mediaMode) ? item.selectedPhotos : [],
      selectedInstagramPost: requiresInstagram(item.mediaMode) ? item.selectedInstagramPost : null,
      angle: item.angle ?? null,
      blurb,
    })
  }

  if (!draft.listicleType) throw new Error('Listicle type is required')
  const expectedBlockType = getBlockTypeForListicleType(draft.listicleType)
  if (draft.items.some((item) => item.blockType !== expectedBlockType)) {
    throw new Error('Item block types do not match selected listicle type')
  }

  const seoSectionForSubmit = targetStatus === 'published'
    ? {
        ...draft.seoSection,
        structuredData: serializeStructuredDataTemplate(
          buildSingleTypeListicleStructuredDataTemplate({
            draft: {
              ...draft,
              status: 'published',
            },
            relatedItems,
            publisherConfig: schemaPublisherConfig,
          }),
        ),
      }
    : draft.seoSection

  const body: Record<string, unknown> = {
    title: draft.title.trim(),
    ...(draft.payloadSlug?.trim() ? { slug: draft.payloadSlug.trim() } : {}),
    location: draft.location,
    locationRef: selectedLocationRefId,
    sharedNeighborhoods: draft.sharedNeighborhoods,
    listicleType: draft.listicleType,
    targetItemCount: draft.targetItemCount,
    listTone: draft.listTone,
    step1_complete: true,
    in_update_mode: false,
    step2_complete: draft.step2_complete,
    step2_in_update_mode: false,
    step3_complete: draft.step3_complete,
    step3_in_update_mode: false,
    header: {
      intro: headerIntro,
      featuredMediaSet: draft.header.featuredMediaSet || undefined,
      featuredImage: draft.header.featuredImage || undefined,
    },
    items: payloadItems,
    seoSection: buildSeoPayload(seoSectionForSubmit),
    status: targetStatus,
    articleType: 'single-type-listicle',
  }

  let doc = draft.payloadId
    ? await updateListicle(draft.payloadId, body)
    : await createListicle(body)

  if (targetStatus === 'published') {
    const publishedStructuredData = serializeStructuredDataTemplate(
      buildSingleTypeListicleStructuredDataTemplate({
        draft: {
          ...draft,
          ...buildPayloadListicleMetadataPatch({
            doc,
            fallbackAuthorName: schemaPublisherConfig.defaultAuthorName,
          }),
          status: 'published',
          seoSection: seoSectionForSubmit,
        },
        relatedItems,
        publisherConfig: schemaPublisherConfig,
      }),
    )

    if (publishedStructuredData !== seoSectionForSubmit.structuredData.trim()) {
      doc = await updateListicle(doc.id, {
        ...body,
        seoSection: buildSeoPayload({
          ...seoSectionForSubmit,
          structuredData: publishedStructuredData,
        }),
      })
    }
  }

  let nextDraft = payloadDocToDraft(doc, draft.draftId)
  nextDraft.editorModelName = draft.editorModelName
  nextDraft.header.introMarkdown = draft.header.introMarkdown
  nextDraft.items = nextDraft.items.map((nextItem, index) => ({
    ...nextItem,
    blurbMarkdown: draft.items[index]?.blurbMarkdown || '',
  }))
  nextDraft = markDraftAsPayloadSynced(
    nextDraft,
    buildSingleTypeListicleDraftComparableShape,
    doc.updatedAt || new Date().toISOString(),
  )

  const resultMessage = targetStatus === 'published'
    ? `Published listicle #${doc.id}`
    : `Synced draft listicle #${doc.id} to Payload`

  return { doc, nextDraft, resultMessage }
}
