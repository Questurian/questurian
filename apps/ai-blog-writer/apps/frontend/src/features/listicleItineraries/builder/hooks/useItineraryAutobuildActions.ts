import { useCallback, useState } from 'react'
import { resolveEditorAssistModelName } from '../../../staging/api'
import { buildArticleOgUrl } from '../../../../shared/seo/utils/buildArticleOgUrl'
import { formatLocationLabel } from '../../../../shared/locationScope/labels'
import { composeItineraryBriefWithAi, rewriteBlockWithAi } from '../../api'
import type { TravelerProfile } from '../../types'
import { applyAutobuildPlanToDraft } from '../mappers/autobuild-plan.mapper'
import {
  generateItinerary,
  type AutobuildResponse
} from '../services/autobuild.api'
import {
  DEFAULT_DAY_SHELL_ID,
  getDayShellTemplate
} from '../constants/day-shells.constants'
import type { ItineraryBuilderAiActionsParams } from './itineraryBuilderAiActions.types'

type Params = Pick<
  ItineraryBuilderAiActionsParams,
  'draft' | 'setDraft' | 'locations' | 'onError' | 'setResult'
>

export function useItineraryAutobuildActions({
  draft,
  setDraft,
  locations,
  onError,
  setResult
}: Params) {
  const [autobuildReport, setAutobuildReport] =
    useState<AutobuildResponse | null>(null)
  const [isAutobuildReportOpen, setIsAutobuildReportOpen] = useState(false)
  const [isGeneratingSlug, setIsGeneratingSlug] = useState(false)
  const [isGeneratingItinerary, setIsGeneratingItinerary] = useState(false)

  const composeTravelerBrief = useCallback(
    async (profile: TravelerProfile): Promise<string> => {
      if (!draft) {
        throw new Error('Draft is not loaded yet.')
      }
      const location = locations.find(
        (entry) => entry.locationKey === draft.location
      )
      const response = await composeItineraryBriefWithAi({
        travelerTypes: profile.travelerTypes,
        motivations: profile.motivations,
        interests: profile.interests,
        budget: profile.budget || undefined,
        accommodations: profile.accommodations,
        practicalNeeds: profile.practicalNeeds,
        notes: profile.notes.trim() || undefined,
        locationLabel: location ? formatLocationLabel(location) : undefined,
        dayCount: draft.dayCount,
        articleTitle: draft.title.trim() || undefined,
        modelName: resolveEditorAssistModelName(draft.editorModelName)
      })
      const brief = response.brief?.trim()
      if (!brief) {
        throw new Error('AI returned an empty brief.')
      }
      return brief
    },
    [draft, locations]
  )

  const applySlugAndOgUrl = useCallback(
    (slug: string) => {
      const location = locations.find((l) => l.locationKey === draft?.location)
      const newUrl =
        slug.trim() && location?.country
          ? buildArticleOgUrl(
              location.country,
              location.city,
              'itinerary',
              slug.trim()
            )
          : undefined
      setDraft((current) => {
        if (!current) return current
        return {
          ...current,
          payloadSlug: slug,
          updatedAt: new Date().toISOString(),
          ...(newUrl
            ? {
                seoSection: {
                  ...current.seoSection,
                  openGraph: { ...current.seoSection.openGraph, url: newUrl }
                }
              }
            : {})
        }
      })
    },
    [draft?.location, locations, setDraft]
  )

  const handleGenerateSlugWithAi = useCallback(async () => {
    if (!draft?.title.trim()) return
    setIsGeneratingSlug(true)
    try {
      const response = await rewriteBlockWithAi({
        prompt: `Generate a clean SEO-friendly URL slug for this article title:\n\nTitle: ${draft.title.trim()}\n\nRules:\n- Think like a real user searching Google.\n- Keep the most important search keywords.\n- Remove filler words like "the," "a," "an," "in," "of," "to," and "for" unless they are needed.\n- Keep it short, readable, and specific.\n- Use lowercase only.\n- Use hyphens between words.\n- Do not keyword-stuff.\n- Do not add words that are not strongly related to the title.\n- Prefer search-intent wording over matching the title exactly.\n- Return only the slug, no explanation.\n\nExample:\nTitle: The Best Steakhouses in Las Vegas\nSlug: best-steakhouses-las-vegas`,
        blockContent: draft.title.trim(),
        modelName: resolveEditorAssistModelName(draft.editorModelName),
        articleTitle: draft.title.trim()
      })
      const slug = response.rewritten_content?.trim()
      if (slug) applySlugAndOgUrl(slug)
    } catch (err) {
      onError(
        err instanceof Error ? err.message : 'Failed to generate slug with AI.'
      )
    } finally {
      setIsGeneratingSlug(false)
    }
  }, [draft, onError, applySlugAndOgUrl])

  const handleGenerateItinerary = useCallback(async () => {
    if (!draft) return
    if (!draft.title.trim() || !draft.location) {
      onError('Add a title and location before using the AI Autobuild brief.')
      return
    }
    const brief = (draft.generationBrief || '').trim()
    if (!brief) return
    const hasExistingStops = draft.days.some(
      (day) => day.items.length > 0 || day.whereStaying.length > 0
    )
    if (
      hasExistingStops &&
      !window.confirm(
        'This will replace the current stops with a freshly generated plan. Continue?'
      )
    ) {
      return
    }

    setIsGeneratingItinerary(true)
    onError('')
    setResult(null)
    setAutobuildReport(null)
    setIsAutobuildReportOpen(false)
    try {
      const plan = await generateItinerary({
        location: draft.location,
        title: draft.title.trim(),
        brief,
        dayCount: draft.dayCount,
                sharedNeighborhoods: draft.sharedNeighborhoods,
        dayShells: draft.days.map((day, dayIndex) => ({
          dayIndex,
          shell: getDayShellTemplate(
            draft.dayShellSelections?.find((entry) => entry.dayId === day.id)
              ?.shellId ?? DEFAULT_DAY_SHELL_ID,
            draft.customDayShells
          )
        })),
        modelName: resolveEditorAssistModelName(draft.editorModelName),
        includeLodging: draft.includeLodging !== false
      })
      setDraft((current) =>
        current ? applyAutobuildPlanToDraft(current, plan) : current
      )
      const filled = plan.days.reduce((sum, day) => sum + day.items.length, 0)
      const issueCount = plan.slot_issues?.length ?? 0
      setResult(
        `Generated ${filled} stop${filled === 1 ? '' : 's'} across ${plan.days.length} day${plan.days.length === 1 ? '' : 's'}.` +
          (issueCount
            ? ` ${issueCount} shell slot${issueCount === 1 ? '' : 's'} need manual picks.`
            : '') +
          (plan.notes.length ? ` Notes: ${plan.notes.join(' ')}` : '')
      )
      setAutobuildReport(plan)
      const hasIssues =
        issueCount > 0 || plan.steps.some((step) => step.status !== 'ok')
      if (hasIssues) {
        setIsAutobuildReportOpen(true)
      }
    } catch (err) {
      onError(
        err instanceof Error ? err.message : 'Failed to generate itinerary.'
      )
    } finally {
      setIsGeneratingItinerary(false)
    }
  }, [draft, onError, setDraft, setResult])

  const handleAutoFillOgUrl = useCallback(() => {
    if (!draft) return
    const slug = draft.payloadSlug?.trim()
    const location = locations.find((l) => l.locationKey === draft.location)
    if (!slug || !location?.country) return
    const url = buildArticleOgUrl(
      location.country,
      location.city,
      'itinerary',
      slug
    )
    if (!url) return
    setDraft((current) => {
      if (!current) return current
      return {
        ...current,
        seoSection: {
          ...current.seoSection,
          openGraph: { ...current.seoSection.openGraph, url }
        }
      }
    })
  }, [draft, locations, setDraft])

  return {
    autobuildReport,
    isAutobuildReportOpen,
    setIsAutobuildReportOpen,
    isGeneratingSlug,
    isGeneratingItinerary,
    composeTravelerBrief,
    applySlugAndOgUrl,
    handleGenerateSlugWithAi,
    handleGenerateItinerary,
    handleAutoFillOgUrl
  }
}
