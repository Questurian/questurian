import { apiFetch } from '../../shared/api/client/apiFetch'
import { parseErrorResponse } from '../../shared/api/client/error-parser'

export type GenerateItineraryTitlesResponse = {
  text: string
  model_used: string
}

export async function generateItineraryTitles(params: {
  prompt: string
  modelName?: string | null
}): Promise<GenerateItineraryTitlesResponse> {
  const response = await apiFetch('/itineraries-pipeline/generate-titles', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: params.prompt,
      model_name: params.modelName ?? undefined,
    }),
  })

  if (!response.ok) {
    const message = await parseErrorResponse(response, 'Title pipeline failed', {
      detail: 'Title pipeline failed',
    })
    throw new Error(message)
  }

  return response.json()
}
