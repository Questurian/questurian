import type { Dispatch, SetStateAction } from 'react'
import { useState } from 'react'
import type { SetURLSearchParams } from 'react-router-dom'
import { isLocationWithinScope } from '../../../locationScope/scope'
import { createItinerary, markdownToLexical, updateItinerary } from '../../api'
import { saveDraft } from '../../storage'
import type { ItineraryBlockType, ListicleItineraryDraft, RelatedItemOption } from '../../types'
import { payloadDocToDraft } from '../mappers/itinerary-draft.mapper'
import { withEndAlignedToLastItem } from '../services/itinerary-timeline.service'
import { requiresInstagram, requiresPhotos } from '../utils/item-media.utils'
import { readLexicalFromJsonText } from '../utils/lexical-json.utils'
import { validateItemMediaSelections } from '../validators/media.validators'
import { validateStep1 } from '../validators/setup.validators'
import { validateItemTimeline } from '../validators/timeline.validators'

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

    const stepIssues = validateStep1(submitDraft)
    if (stepIssues.length > 0) {
      onError(stepIssues.join('. '))
      return
    }

    if (!selectedLocationRefId) {
      onError('Select a valid location')
      return
    }

    const timelineIssues = validateItemTimeline(submitDraft, targetStatus)
    if (timelineIssues.length > 0) {
      onError(timelineIssues[0])
      return
    }

    const mediaIssues = validateItemMediaSelections(submitDraft, relatedByBlockType)
    if (mediaIssues.length > 0) {
      onError(mediaIssues[0])
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
        header: {
          customTitle: submitDraft.header.customTitle.trim() || undefined,
          intro: headerIntro,
          featuredImage: submitDraft.header.featuredImage || undefined,
        },
        items: payloadItems,
        seoSection: {
          seo: submitDraft.seoSection.seo || undefined,
        },
        status: targetStatus,
        articleType: 'listicle-itinerary',
      }

      const doc = draft.payloadId
        ? await updateItinerary(draft.payloadId, body, token)
        : await createItinerary(body, token)

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
