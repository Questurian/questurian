import { apiFetch } from '../../../../shared/api/client/apiFetch'
import { parseErrorResponse } from '../../../../shared/api/client/error-parser'

export type ItineraryFillIdeas = {
  html: string
  model_used: string
  cost_usd?: number | null
  elapsed_seconds?: number | null
}

/**
 * Ask the backend for fill-in ideas. The prompt is built here in the browser
 * (`fill-ideas.prompt.ts`) and the backend adds only the model and transport,
 * so what the model reads is exactly what the draft says.
 *
 * This call is slow by nature — it is a researching model, several round trips
 * inside one request — so there is no client timeout to race it.
 */
export async function requestItineraryFillIdeas(
  prompt: string,
): Promise<ItineraryFillIdeas> {
  const response = await apiFetch('/itineraries-pipeline/suggest-fills', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })

  if (!response.ok) {
    throw new Error(
      await parseErrorResponse(response, 'Fill-in ideas request failed', {
        detail: 'Fill-in ideas request failed',
      }),
    )
  }

  return (await response.json()) as ItineraryFillIdeas
}
