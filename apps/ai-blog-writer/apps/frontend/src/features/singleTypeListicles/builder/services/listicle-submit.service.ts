import { createListicle, getBlockTypeForListicleType, markdownToLexical, updateListicle } from '../../api'
import { buildSeoPayload } from './seo-section.service'
import type { PayloadListicleDoc, RelatedItemOption, SingleTypeListicleDraft } from '../../types'
import { payloadDocToDraft } from '../mappers/listicle-draft.mapper'
import { requiresInstagram, requiresPhotos } from '../utils/item-media.utils'
import { readLexicalFromJsonText } from '../utils/lexical-json.utils'
import { validateSubmit } from '../validators/submit.validators'

export type SubmitListicleParams = {
  draft: SingleTypeListicleDraft
  selectedLocationRefId: number | null
  targetStatus: 'draft' | 'published'
  relatedItems: RelatedItemOption[]
  token: string
}

export async function submitListicle({
  draft,
  selectedLocationRefId,
  targetStatus,
  relatedItems,
  token,
}: SubmitListicleParams): Promise<{ doc: PayloadListicleDoc; nextDraft: SingleTypeListicleDraft; resultMessage: string }> {
  const submitIssue = validateSubmit(draft, selectedLocationRefId, targetStatus, relatedItems)
  if (submitIssue) throw new Error(submitIssue)

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
      mediaMode: item.mediaMode,
      selectedPhotos: requiresPhotos(item.mediaMode) ? item.selectedPhotos : [],
      selectedInstagramPost: requiresInstagram(item.mediaMode) ? item.selectedInstagramPost : null,
      blurb,
    })
  }

  if (!draft.listicleType) throw new Error('Listicle type is required')
  const expectedBlockType = getBlockTypeForListicleType(draft.listicleType)
  if (draft.items.some((item) => item.blockType !== expectedBlockType)) {
    throw new Error('Item block types do not match selected listicle type')
  }

  const body: Record<string, unknown> = {
    title: draft.title.trim(),
    location: draft.location,
    locationRef: selectedLocationRefId,
    listicleType: draft.listicleType,
    targetItemCount: draft.targetItemCount,
    step1_complete: true,
    in_update_mode: false,
    step2_complete: draft.step2_complete,
    step2_in_update_mode: false,
    step3_complete: draft.step3_complete,
    step3_in_update_mode: false,
    header: {
      intro: headerIntro,
      featuredImage: draft.header.featuredImage || undefined,
    },
    items: payloadItems,
    seoSection: buildSeoPayload(draft.seoSection),
    status: targetStatus,
    articleType: 'single-type-listicle',
  }

  const doc = draft.payloadId
    ? await updateListicle(draft.payloadId, body, token)
    : await createListicle(body, token)

  const nextDraft = payloadDocToDraft(doc, draft.draftId)
  nextDraft.editorModelName = draft.editorModelName
  nextDraft.header.introMarkdown = draft.header.introMarkdown
  nextDraft.items = nextDraft.items.map((nextItem, index) => ({
    ...nextItem,
    blurbMarkdown: draft.items[index]?.blurbMarkdown || '',
  }))

  const resultMessage = targetStatus === 'published'
    ? `Published listicle #${doc.id}`
    : `Synced draft listicle #${doc.id} to Payload`

  return { doc, nextDraft, resultMessage }
}
