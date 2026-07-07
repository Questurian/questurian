import { API_URL } from '../client/imageApiClient'

export type CompositeImageLayout = 'two-up' | 'four-up'

export type CompositeImageRequest = {
  layout: CompositeImageLayout
  sources: { mediaSetId: number }[]
  title: string
  altText: string
  photographerCredit: string
  locationRef: number
}

export type CompositeImageCreateResponse = {
  success: boolean
  mediaSetId: string
  externalRef: string
  variantAssetIds: Record<string, string>
  warnings: string[]
}

async function parseCompositeError(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null)
  if (body && typeof body === 'object') {
    const detail = (body as { detail?: unknown }).detail
    if (detail && typeof detail === 'object') {
      const message = (detail as { message?: unknown }).message
      if (typeof message === 'string' && message.trim()) return message
    }
  }
  return `${fallback} (${response.status})`
}

export async function previewCompositeImage(
  request: CompositeImageRequest,
  token: string,
): Promise<{ blob: Blob; warnings: string[] }> {
  const response = await fetch(`${API_URL}/images/composites/preview`, {
    method: 'POST',
    headers: {
      Accept: 'image/webp',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    throw new Error(await parseCompositeError(response, 'Composite preview failed'))
  }

  const warningsHeader = response.headers.get('X-Composite-Warnings')
  const warnings = warningsHeader ? JSON.parse(warningsHeader) as string[] : []
  return { blob: await response.blob(), warnings }
}

export async function createCompositeImage(
  request: CompositeImageRequest,
  token: string,
): Promise<CompositeImageCreateResponse> {
  const response = await fetch(`${API_URL}/images/composites/create`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    throw new Error(await parseCompositeError(response, 'Composite creation failed'))
  }

  return response.json() as Promise<CompositeImageCreateResponse>
}
