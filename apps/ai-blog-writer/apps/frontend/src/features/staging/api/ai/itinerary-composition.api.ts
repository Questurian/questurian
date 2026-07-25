import { requestEditorAssist } from './editor-assist.request'
import type {
  ComposeDayBlurbsRequest,
  ComposeDayBlurbsResponse,
  ComposeItineraryBriefRequest,
  ComposeItineraryBriefResponse,
  ComposeItineraryIntroRequest,
  ComposeItineraryIntroResponse,
  ComposeStopReasonRequest,
  ComposeStopReasonResponse
} from './rewrite.types'

export function composeItineraryBriefWithAi(
  input: ComposeItineraryBriefRequest
): Promise<ComposeItineraryBriefResponse> {
  return requestEditorAssist('compose-itinerary-brief', {
    body: {
      traveler_types: input.travelerTypes,
      motivations: input.motivations,
      interests: input.interests,
      budget: input.budget,
      accommodations: input.accommodations,
      practical_needs: input.practicalNeeds,
      notes: input.notes,
      location_label: input.locationLabel,
      day_count: input.dayCount,
      article_title: input.articleTitle,
      model_name: input.modelName
    },
    errorMessage: 'AI brief composition failed'
  })
}

export function composeItineraryIntroWithAi(
  input: ComposeItineraryIntroRequest
): Promise<ComposeItineraryIntroResponse> {
  return requestEditorAssist('compose-itinerary-intro', {
    body: {
      article_title: input.articleTitle,
      location_label: input.locationLabel,
      list_tone: input.listTone,
      plan_overview: input.planOverview,
      day_count: input.dayCount,
      model_name: input.modelName,
      stops: input.stops.map((stop) => ({
        title: stop.title,
        category: stop.category,
        day_label: stop.dayLabel,
        selection_reason: stop.selectionReason
      }))
    },
    errorMessage: 'AI intro composition failed'
  })
}

export function composeItineraryDayBlurbsWithAi(
  input: ComposeDayBlurbsRequest
): Promise<ComposeDayBlurbsResponse> {
  return requestEditorAssist('compose-itinerary-day-blurbs', {
    body: {
      article_title: input.articleTitle,
      location_label: input.locationLabel,
      list_tone: input.listTone,
      plan_overview: input.planOverview,
      intro: input.intro,
      day_label: input.dayLabel,
      day_count: input.dayCount,
      prev_day_last_stop: input.prevDayLastStop
        ? {
            title: input.prevDayLastStop.title,
            category: input.prevDayLastStop.category
          }
        : undefined,
      next_day_first_stop: input.nextDayFirstStop
        ? {
            title: input.nextDayFirstStop.title,
            category: input.nextDayFirstStop.category
          }
        : undefined,
      model_name: input.modelName,
      write_target_ids: input.writeTargetIds,
      stops: input.stops.map((stop) => ({
        target_id: stop.targetId,
        title: stop.title,
        category: stop.category,
        daypart: stop.daypart,
        angle: stop.angle,
        selection_reason: stop.selectionReason,
        existing_blurb: stop.existingBlurb
      }))
    },
    errorMessage: 'AI day-blurb composition failed'
  })
}

export function composeItineraryStopReasonWithAi(
  input: ComposeStopReasonRequest
): Promise<ComposeStopReasonResponse> {
  return requestEditorAssist('compose-itinerary-stop-reason', {
    body: {
      rough_reason: input.roughReason,
      title: input.title,
      category: input.category,
      daypart: input.daypart,
      angle: input.angle,
      article_title: input.articleTitle,
      location_label: input.locationLabel,
      plan_overview: input.planOverview,
      model_name: input.modelName
    },
    errorMessage: 'AI stop-reason composition failed'
  })
}
