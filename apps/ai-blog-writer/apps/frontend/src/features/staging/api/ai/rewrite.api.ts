import { API_BASE_URL } from '../../../../shared/api/client/config'
import { parseErrorResponse } from '../../../../shared/api/client/error-parser'
import type {
  ComposeDayBlurbsRequest,
  ComposeDayBlurbsResponse,
  ComposeItineraryBriefRequest,
  ComposeItineraryBriefResponse,
  ComposeItineraryIntroRequest,
  ComposeItineraryIntroResponse,
  ComposeStopReasonRequest,
  ComposeStopReasonResponse,
  GenerateTitleWithAiRequest,
  GenerateTitleWithAiResponse,
  GenerateListicleContentRequest,
  GenerateListicleContentResponse,
  ListicleGuidelinesResponse,
  RewriteBlockWithAiRequest,
  RewriteBlockWithAiResponse,
} from './rewrite.types'

export async function generateTitleWithAi(
  input: GenerateTitleWithAiRequest,
): Promise<GenerateTitleWithAiResponse> {
  const { currentTitle, prompt, modelName } = input

  const response = await fetch(`${API_BASE_URL}/editor-assist/generate-title`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      current_title: currentTitle,
      prompt,
      model_name: modelName,
    }),
  })

  if (!response.ok) {
    const message = await parseErrorResponse(response, 'AI title generation failed', { detail: 'AI title generation failed' })
    throw new Error(message)
  }

  return response.json()
}

export async function rewriteBlockWithAi(
  input: RewriteBlockWithAiRequest,
): Promise<RewriteBlockWithAiResponse> {
  const {
    prompt,
    blockContent,
    modelName,
    articleTitle,
    articleContext,
  } = input

  const response = await fetch(`${API_BASE_URL}/editor-assist/rewrite-block`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      block_content: blockContent,
      model_name: modelName,
      article_title: articleTitle,
      article_context: articleContext,
    }),
  })

  if (!response.ok) {
    const message = await parseErrorResponse(response, 'AI rewrite failed', { detail: 'AI rewrite failed' })
    throw new Error(message)
  }

  return response.json()
}

export async function composeItineraryBriefWithAi(
  input: ComposeItineraryBriefRequest,
): Promise<ComposeItineraryBriefResponse> {
  const response = await fetch(`${API_BASE_URL}/editor-assist/compose-itinerary-brief`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
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
      model_name: input.modelName,
    }),
  })

  if (!response.ok) {
    const message = await parseErrorResponse(response, 'AI brief composition failed', { detail: 'AI brief composition failed' })
    throw new Error(message)
  }

  return response.json()
}

export async function composeItineraryIntroWithAi(
  input: ComposeItineraryIntroRequest,
): Promise<ComposeItineraryIntroResponse> {
  const response = await fetch(`${API_BASE_URL}/editor-assist/compose-itinerary-intro`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
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
        selection_reason: stop.selectionReason,
      })),
    }),
  })

  if (!response.ok) {
    const message = await parseErrorResponse(response, 'AI intro composition failed', { detail: 'AI intro composition failed' })
    throw new Error(message)
  }

  return response.json()
}

export async function composeItineraryDayBlurbsWithAi(
  input: ComposeDayBlurbsRequest,
): Promise<ComposeDayBlurbsResponse> {
  const response = await fetch(`${API_BASE_URL}/editor-assist/compose-itinerary-day-blurbs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      article_title: input.articleTitle,
      location_label: input.locationLabel,
      list_tone: input.listTone,
      plan_overview: input.planOverview,
      intro: input.intro,
      day_label: input.dayLabel,
      day_count: input.dayCount,
      prev_day_last_stop: input.prevDayLastStop
        ? { title: input.prevDayLastStop.title, category: input.prevDayLastStop.category }
        : undefined,
      next_day_first_stop: input.nextDayFirstStop
        ? { title: input.nextDayFirstStop.title, category: input.nextDayFirstStop.category }
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
        existing_blurb: stop.existingBlurb,
      })),
    }),
  })

  if (!response.ok) {
    const message = await parseErrorResponse(response, 'AI day-blurb composition failed', { detail: 'AI day-blurb composition failed' })
    throw new Error(message)
  }

  return response.json()
}

export async function composeItineraryStopReasonWithAi(
  input: ComposeStopReasonRequest,
): Promise<ComposeStopReasonResponse> {
  const response = await fetch(`${API_BASE_URL}/editor-assist/compose-itinerary-stop-reason`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      rough_reason: input.roughReason,
      title: input.title,
      category: input.category,
      daypart: input.daypart,
      angle: input.angle,
      article_title: input.articleTitle,
      location_label: input.locationLabel,
      plan_overview: input.planOverview,
      model_name: input.modelName,
    }),
  })

  if (!response.ok) {
    const message = await parseErrorResponse(response, 'AI stop-reason composition failed', { detail: 'AI stop-reason composition failed' })
    throw new Error(message)
  }

  return response.json()
}

export async function fetchListicleGuidelines(): Promise<ListicleGuidelinesResponse> {
  const response = await fetch(`${API_BASE_URL}/editor-assist/listicle-guidelines`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const message = await parseErrorResponse(response, 'Failed to load listicle guidelines', { detail: 'Failed to load listicle guidelines' })
    throw new Error(message)
  }

  return response.json()
}

export async function generateListicleContentWithAi(
  input: GenerateListicleContentRequest,
): Promise<GenerateListicleContentResponse> {
  const response = await fetch(`${API_BASE_URL}/editor-assist/generate-listicle-content`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      article_title: input.articleTitle,
      article_type: input.articleType,
      location_label: input.locationLabel,
      article_context: input.articleContext,
      model_name: input.modelName,
      custom_instruction: input.customInstruction,
      skip_existing: input.skipExisting,
      list_tone: input.listTone,
      targets: input.targets.map((target) => ({
        target_id: target.targetId,
        field_type: target.fieldType,
        category: target.category,
        display_name: target.displayName,
        research_subject: target.researchSubject,
        location_label: target.locationLabel,
        current_content: target.currentContent,
        supporting_context: target.supportingContext,
        payload_doc_id: target.payloadDocId,
        payload_collection: target.payloadCollection,
        angle: target.angle,
      })),
    }),
  })

  if (!response.ok) {
    const message = await parseErrorResponse(response, 'AI listicle generation failed', { detail: 'AI listicle generation failed' })
    throw new Error(message)
  }

  return response.json()
}
