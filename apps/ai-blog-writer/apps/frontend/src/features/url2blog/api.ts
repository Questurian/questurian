const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4003'
const FEATURE_PREFIX = '/url2blog'

export type ExtractResponse = {
  message: string
  source_url: string
  raw_text_length: number
  raw_response: string
  parsed: { title: string; content: string; language: string } | null
  parse_error: string | null
  translated: { title: string; content: string } | null
  translation_skipped: boolean
  translation_error: string | null
}

export async function extractArticle(url: string): Promise<ExtractResponse> {
  const response = await fetch(`${API_BASE_URL}${FEATURE_PREFIX}/extract`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: 'Extraction failed' }))
    throw new Error(errorData.detail || 'Extraction failed')
  }

  return response.json()
}
