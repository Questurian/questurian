import { PAYLOAD_API_URL } from '../../../shared/api/client/config'
import { parseErrorResponse } from '../../../shared/api/client/error-parser'

const HOMEPAGE_FEATURED_REQUEST_TIMEOUT_MS = 12000

export async function mainHomepageRequest<T>(
  endpoint: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const controller = new AbortController()
  const externalSignal = init?.signal
  let didTimeout = false
  const timeoutId = window.setTimeout(() => {
    didTimeout = true
    controller.abort()
  }, HOMEPAGE_FEATURED_REQUEST_TIMEOUT_MS)
  const abortFromExternalSignal = () => controller.abort(externalSignal?.reason)

  if (externalSignal?.aborted) {
    abortFromExternalSignal()
  } else {
    externalSignal?.addEventListener('abort', abortFromExternalSignal, { once: true })
  }

  try {
    const response = await fetch(`${PAYLOAD_API_URL}${endpoint}`, {
      ...init,
      mode: 'cors',
      credentials: 'include',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
    })

    if (!response.ok) {
      const message = await parseErrorResponse(
        response,
        `Homepage featured content request failed: ${response.status}`,
      )
      throw new Error(message)
    }

    return response.json()
  } catch (error: unknown) {
    if (didTimeout && error instanceof Error && error.name === 'AbortError') {
      throw new Error(
        `Homepage featured content request timed out after ${Math.round(HOMEPAGE_FEATURED_REQUEST_TIMEOUT_MS / 1000)}s`,
      )
    }

    throw error
  } finally {
    window.clearTimeout(timeoutId)
    externalSignal?.removeEventListener('abort', abortFromExternalSignal)
  }
}
