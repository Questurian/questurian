import type { ItineraryBuilderAiActionsParams } from './itineraryBuilderAiActions.types'
import { useItineraryAutobuildActions } from './useItineraryAutobuildActions'
import { useItineraryContentAiActions } from './useItineraryContentAiActions'
import { useItinerarySeoAiActions } from './useItinerarySeoAiActions'

export function useItineraryBuilderAiActions(
  params: ItineraryBuilderAiActionsParams
) {
  const autobuildActions = useItineraryAutobuildActions(params)
  const contentActions = useItineraryContentAiActions(params)
  const seoActions = useItinerarySeoAiActions(params)

  return {
    ...seoActions,
    ...contentActions,
    ...autobuildActions
  }
}
