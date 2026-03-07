import type { Dispatch, SetStateAction } from 'react'
import { useState } from 'react'
import type { SetURLSearchParams } from 'react-router-dom'
import { getSchemaPublisherConfig } from '../../../shared/seo/services/schema-publisher-config.service'
import { isLocationWithinScope } from '../../../locationScope/scope'
import { createItinerary, markdownToLexical, updateItinerary } from '../../api'
import { saveDraft } from '../../storage'
import type { ItineraryBlockType, ListicleItineraryDraft, RelatedItemOption } from '../../types'
import { payloadDocToDraft } from '../mappers/itinerary-draft.mapper'
import { buildPayloadItineraryMetadataPatch } from '../services/payload-itinerary-metadata.service'
import { buildSeoPayload } from '../services/seo-section.service'
import {
  buildListicleItineraryStructuredDataTemplate,
  serializeStructuredDataTemplate,
} from '../services/structured-data-template.service'
import { withEndAlignedToLastItem } from '../services/itinerary-timeline.service'
import { requiresInstagram, requiresPhotos } from '../utils/item-media.utils'
import { readLexicalFromJsonText } from '../utils/lexical-json.utils'
import { validateStep1 } from '../validators/setup.validators'
import { validateSeoSection, validateStep2, validateStep3 } from '../validators/step.validators'
import { normalizeTripIntent } from '../../../trip-intent'

type UseItinerarySubmitParams = {
  token?: string
  draft: ListicleItineraryDraft | null
  setDraft: Dispatch<SetStateAction<ListicleItineraryDraft | null>>
  selectedLocationRefId: number | null
  relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]>
  setSearchParams: SetURLSearchParams
  onError: (message: string) => void
  setResult: Dispatch<SetStateAction<string | null>>
}

type UseItinerarySubmitResult = {
  isSaving: boolean
  submit: (targetStatus: 'draft' | 'published') => Promise<void>
}

export function useItinerarySubmit({
  token,
  draft,
  setDraft,
  selectedLocationRefId,
  relatedByBlockType,
  setSearchParams,
  onError,
  setResult,
}: UseItinerarySubmitParams): UseItinerarySubmitResult {
  const [isSaving, setIsSaving] = useState(false)

  async function submit(targetStatus: 'draft' | 'published') {
    if (!token || !draft) return

    onError('')
    setResult(null)

    const submitDraft = withEndAlignedToLastItem(draft)
    const schemaPublisherConfig = getSchemaPublisherConfig()

    const stepIssues = validateStep1(submitDraft)
    if (stepIssues.length > 0) {
      onError(stepIssues.join('. '))
      return
    }

    const step2Issues = validateStep2(submitDraft)
    if (step2Issues.length > 0) {
      onError(step2Issues[0])
      return
    }

    const step3Issues = validateStep3(submitDraft, relatedByBlockType)
    if (step3Issues.length > 0) {
      onError(step3Issues[0])
      return
    }

    if (!submitDraft.step2_complete || submitDraft.step2_in_update_mode) {
      onError('Lock Step 2 before syncing to Payload.')
      return
    }

    if (!submitDraft.step3_complete || submitDraft.step3_in_update_mode) {
      onError('Lock Step 3 before syncing to Payload.')
      return
    }

    if (!selectedLocationRefId) {
      onError('Select a valid location')
      return
    }

    const seoSectionForSubmit = targetStatus === 'published'
      ? {
          ...submitDraft.seoSection,
          structuredData: serializeStructuredDataTemplate(
            buildListicleItineraryStructuredDataTemplate({
              draft: {
                ...submitDraft,
                status: 'published',
              },
              relatedByBlockType,
              publisherConfig: schemaPublisherConfig,
            }),
          ),
        }
      : submitDraft.seoSection

    const seoIssues = validateSeoSection({
      draft: {
        ...submitDraft,
        status: targetStatus,
        seoSection: seoSectionForSubmit,
      },
      targetStatus,
    })
    if (seoIssues.length > 0) {
      onError(seoIssues[0])
      return
    }

    try {
      setIsSaving(true)

      const headerIntro = submitDraft.header.introMarkdown.trim()
        ? await markdownToLexical(submitDraft.header.introMarkdown)
        : readLexicalFromJsonText(submitDraft.header.introJsonText || '', 'Header intro')

      if (!submitDraft.header.introMarkdown.trim() && !submitDraft.header.introJsonText?.trim()) {
        throw new Error('Header intro is required (markdown or lexical JSON)')
      }

      const payloadItems = [] as Array<Record<string, unknown>>
      for (let index = 0; index < submitDraft.items.length; index += 1) {
        const item = submitDraft.items[index]
        if (!item.item) {
          throw new Error(`Item ${index + 1} is missing related entry selection`)
        }

        const relatedOptions = relatedByBlockType[item.blockType] || []
        const selectedRelated = relatedOptions.find((entry) => entry.id === item.item)
        if (
          selectedRelated?.location
          && draft.location
          && !isLocationWithinScope(selectedRelated.location, draft.location)
        ) {
          throw new Error(`Item ${index + 1} location does not match itinerary location (${submitDraft.location})`)
        }

        const blurb = item.blurbMarkdown.trim()
          ? await markdownToLexical(item.blurbMarkdown)
          : readLexicalFromJsonText(item.blurbJsonText || '', `Item ${index + 1} blurb`)

        if (!item.blurbMarkdown.trim() && !item.blurbJsonText?.trim()) {
          throw new Error(`Item ${index + 1} blurb is required (markdown or lexical JSON)`)
        }

        payloadItems.push({
          blockType: item.blockType,
          timeHour: item.timeHour,
          timeMinute: item.timeMinute,
          timePeriod: item.timePeriod,
          durationHours: item.durationHours,
          durationMinutes: item.durationMinutes,
          item: item.item,
          mediaMode: item.mediaMode,
          selectedPhotos: requiresPhotos(item.mediaMode) ? item.selectedPhotos : [],
          selectedInstagramPost: requiresInstagram(item.mediaMode) ? item.selectedInstagramPost : null,
          blurb,
        })
      }

      const body: Record<string, unknown> = {
        title: submitDraft.title.trim(),
        location: submitDraft.location,
        locationRef: selectedLocationRefId,
        dayAudience: submitDraft.dayAudience,
        itineraryStartHour: submitDraft.itineraryStartHour,
        itineraryStartMinute: submitDraft.itineraryStartMinute,
        itineraryStartPeriod: submitDraft.itineraryStartPeriod,
        itineraryEndHour: submitDraft.itineraryEndHour,
        itineraryEndMinute: submitDraft.itineraryEndMinute,
        itineraryEndPeriod: submitDraft.itineraryEndPeriod,
        step1_complete: true,
        in_update_mode: false,
        tripIntent: normalizeTripIntent(submitDraft.tripIntent),
        step2_complete: submitDraft.step2_complete,
        step2_in_update_mode: false,
        step3_complete: submitDraft.step3_complete,
        step3_in_update_mode: false,
        header: {
          intro: headerIntro,
          featuredImage: submitDraft.header.featuredImage || undefined,
        },
        items: payloadItems,
        seoSection: buildSeoPayload(seoSectionForSubmit),
        status: targetStatus,
        articleType: 'listicle-itinerary',
      }

      let doc = draft.payloadId
        ? await updateItinerary(draft.payloadId, body, token)
        : await createItinerary(body, token)

      if (targetStatus === 'published') {
        const publishedStructuredData = serializeStructuredDataTemplate(
          buildListicleItineraryStructuredDataTemplate({
            draft: {
              ...submitDraft,
              ...buildPayloadItineraryMetadataPatch({
                doc,
                fallbackAuthorName: schemaPublisherConfig.defaultAuthorName,
              }),
              status: 'published',
              seoSection: seoSectionForSubmit,
            },
            relatedByBlockType,
            publisherConfig: schemaPublisherConfig,
          }),
        )

        if (publishedStructuredData !== seoSectionForSubmit.structuredData.trim()) {
          doc = await updateItinerary(doc.id, {
            ...body,
            seoSection: buildSeoPayload({
              ...seoSectionForSubmit,
              structuredData: publishedStructuredData,
            }),
          }, token)
        }
      }

      const nextDraft = payloadDocToDraft(doc, draft.draftId)
      nextDraft.editorModelName = draft.editorModelName
      nextDraft.header.introMarkdown = submitDraft.header.introMarkdown
      nextDraft.items = nextDraft.items.map((nextItem, index) => ({
        ...nextItem,
        blurbMarkdown: submitDraft.items[index]?.blurbMarkdown || '',
      }))
      setDraft(nextDraft)
      saveDraft(nextDraft)

      setResult(targetStatus === 'published' ? `Published itinerary #${doc.id}` : `Saved draft itinerary #${doc.id}`)

      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.set('id', String(doc.id))
          next.set('draftId', nextDraft.draftId)
          return next
        },
        { replace: true },
      )
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setIsSaving(false)
    }
  }

  return {
    isSaving,
    submit,
  }
}
