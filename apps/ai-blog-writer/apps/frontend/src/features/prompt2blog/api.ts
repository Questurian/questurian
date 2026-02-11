const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4003'
const FEATURE_PREFIX = '/prompt2blog'

export type SynthesizeResponse = {
  synthesized: string
}

export async function synthesizeSources(blobs: string[]): Promise<SynthesizeResponse> {
  const response = await fetch(`${API_BASE_URL}${FEATURE_PREFIX}/synthesize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blobs }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || 'Synthesis request failed')
  }

  return response.json()
}
