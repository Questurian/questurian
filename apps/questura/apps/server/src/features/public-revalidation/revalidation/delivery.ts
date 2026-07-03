import { clientBaseUrl, REVALIDATION_TIMEOUT_MS, revalidationSecret } from './env'
import { unique } from './cache-tags'
import type { RevalidationTarget } from './types'

export async function triggerClientRevalidation(
  target: RevalidationTarget,
  reason: string,
): Promise<void> {
  const tags = unique(target.tags)
  const paths = unique(target.paths)
  if (tags.length === 0 && paths.length === 0) return

  const baseUrl = clientBaseUrl()
  const secret = revalidationSecret()
  if (!baseUrl || !secret) {
    console.warn('[public-revalidation] skipped: missing client URL or secret', { reason, tags, paths })
    return
  }

  try {
    const response = await fetch(`${baseUrl}/api/revalidate`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-revalidation-secret': secret,
      },
      signal: AbortSignal.timeout(REVALIDATION_TIMEOUT_MS),
      body: JSON.stringify({ tags, paths }),
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      console.error('[public-revalidation] failed', {
        reason,
        status: response.status,
        body,
        tags,
        paths,
      })
    }
  } catch (error) {
    console.error('[public-revalidation] failed to call client', { reason, error, tags, paths })
  }
}
