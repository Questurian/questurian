import { apiFetch } from '../../../api/client/apiFetch'

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
      const { message, step, detail: inner } = detail as {
        message?: unknown
        step?: unknown
        detail?: unknown
      }
      const parts: string[] = []
      if (typeof message === 'string' && message.trim()) parts.push(message.trim())
      if (typeof inner === 'string' && inner.trim()) parts.push(inner.trim())
      if (typeof step === 'string' && step.trim()) parts.push(`(step: ${step.trim()})`)
      if (parts.length > 0) return parts.join(' — ')
    }
  }
  return `${fallback} (${response.status})`
}

export async function previewCompositeImage(
  request: CompositeImageRequest,
): Promise<{ blob: Blob; warnings: string[] }> {
  const response = await apiFetch('/images/composites/preview', {
    method: 'POST',
    headers: {
      Accept: 'image/webp',
      'Content-Type': 'application/json',
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

export type HangingComposite = {
  mediaSetId: number
  externalRef: string
  title: string
  createdAt: string | null
  variantCount: number
  expectedVariants: number
  previewUrl: string | null
  assetIds: string[]
}

export type HangingCompositesResponse = {
  hanging: HangingComposite[]
  count: number
}

export type CleanupCompositesResponse = {
  deleted: string[]
  skipped: string[]
  errors: { mediaSetId: string; detail: string }[]
  deletedCount: number
}

export async function fetchHangingComposites(): Promise<HangingCompositesResponse> {
  const response = await apiFetch('/images/composites/hanging', {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  })
  if (!response.ok) {
    throw new Error(await parseCompositeError(response, 'Failed to load hanging composites'))
  }
  return response.json() as Promise<HangingCompositesResponse>
}

export async function cleanupHangingComposites(
  mediaSetIds: number[],
): Promise<CleanupCompositesResponse> {
  const response = await apiFetch('/images/composites/cleanup', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ mediaSetIds }),
  })
  if (!response.ok) {
    throw new Error(await parseCompositeError(response, 'Composite cleanup failed'))
  }
  return response.json() as Promise<CleanupCompositesResponse>
}

export async function createCompositeImage(
  request: CompositeImageRequest,
): Promise<CompositeImageCreateResponse> {
  const response = await apiFetch('/images/composites/create', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    throw new Error(await parseCompositeError(response, 'Composite creation failed'))
  }

  return response.json() as Promise<CompositeImageCreateResponse>
}
