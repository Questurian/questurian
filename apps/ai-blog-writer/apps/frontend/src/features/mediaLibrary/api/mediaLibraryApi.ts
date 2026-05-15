import { API_URL } from '../../../shared/images/api/client/imageApiClient'

export async function generateAltTextFromUrl(
  imageUrl: string,
  token: string,
  narrativeFocus?: string,
): Promise<string> {
  const formData = new FormData()
  formData.append('url', imageUrl)
  if (narrativeFocus?.trim()) {
    formData.append('narrative_focus', narrativeFocus.trim())
  }

  const response = await fetch(`${API_URL}/images/generate-alt-text-from-url`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Alt text generation failed: ${response.status}${text ? ` — ${text}` : ''}`)
  }

  const data = await response.json()
  return data.alt_text as string
}
