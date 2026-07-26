import type { ComposeDayBlurbsResponse } from '../../../staging/api'
import type { ItineraryItemBlock, ListicleItineraryDraft } from '../../types'

export function buildFailedDayBlurbComposeReport(params: {
  modelName: string
  errorMessage: string
  durationMs: number
  label?: string
}): ComposeDayBlurbsResponse {
  return {
    model_used: params.modelName,
    results: {},
    steps: [
      {
        name: 'request',
        label: params.label ?? 'Day composer request',
        status: 'failed',
        duration_ms: params.durationMs,
        model: params.modelName,
        details: { error: params.errorMessage }
      }
    ]
  }
}

/** Apply composed blurbs for one day; only `generated` results land. */
export function applyItineraryComposedDayBlurbs(
  draft: ListicleItineraryDraft,
  dayIndex: number,
  response: ComposeDayBlurbsResponse
): ListicleItineraryDraft {
  const applyToRow = (item: ItineraryItemBlock): ItineraryItemBlock => {
    const result = response.results[`${item.id}_blurb`]
    if (result?.status !== 'generated' || !result.markdown) return item
    return { ...item, blurbMarkdown: result.markdown, blurbJsonText: '' }
  }

  return {
    ...draft,
    days: draft.days.map((day, index) => {
      if (index !== dayIndex) return day
      return {
        ...day,
        whereStaying: day.whereStaying.map(applyToRow),
        items: day.items.map(applyToRow)
      }
    })
  }
}
