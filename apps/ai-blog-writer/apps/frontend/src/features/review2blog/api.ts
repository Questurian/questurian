const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4003'
const FEATURE_PREFIX = '/review2blog'

export type RestaurantContext = {
  id?: number
  name?: string | null
  district?: string | null
  neighborhoodDescription?: string | null
  description?: string | null
  reviews_summary?: string | null
}

export type ListicleConfig = {
  listicle_type: string
  listicle_title: string
  listicle_goal: string
}

export type ReviewPhase1Response = {
  message: string
  input_count: number
  restaurant_context: RestaurantContext
  raw_response: string
  parsed: unknown | null
  parse_error: string | null
  batch_size?: number
  batch_count?: number
  batch_errors?: string[]
  max_tokens?: number
}

export type ReviewPhase2Response = {
  message: string
  input_count: number
  raw_response: string
  parsed: unknown | null
  parse_error: string | null
  max_tokens?: number
}

export type Phase3Request = {
  aggregated_profile: unknown
  restaurant_context: RestaurantContext
  listicle: ListicleConfig
}

export type ReviewPhase3Response = {
  message: string
  blurb: string
}

export async function uploadReviewJson(file: File): Promise<ReviewPhase1Response> {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch(`${API_BASE_URL}${FEATURE_PREFIX}/upload`, {
    method: 'POST',
    body: formData
  })

  if (!response.ok) {
    throw new Error('Review upload failed')
  }

  return response.json()
}

export async function runPhase2(
  signals: unknown,
): Promise<ReviewPhase2Response> {
  const response = await fetch(`${API_BASE_URL}${FEATURE_PREFIX}/phase2`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(signals)
  })

  if (!response.ok) {
    throw new Error('Review phase 2 failed')
  }

  return response.json()
}

export async function runPhase3(
  request: Phase3Request,
): Promise<ReviewPhase3Response> {
  const response = await fetch(`${API_BASE_URL}${FEATURE_PREFIX}/phase3`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(request)
  })

  if (!response.ok) {
    throw new Error('Review phase 3 failed')
  }

  return response.json()
}
