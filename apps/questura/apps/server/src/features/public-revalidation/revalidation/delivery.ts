import { clientBaseUrl, REVALIDATION_TIMEOUT_MS, revalidationSecret } from './env'
import { unique } from './cache-tags'
import type { RevalidationTarget } from './types'

/**
 * Tell the frontend to revalidate, and throw if it did not.
 *
 * The refresh outbox (`features/refresh-outbox`) needs to know whether the
 * delivery worked so it can retry; the old fire-and-log version could not
 * say. An unconfigured frontend (no URL or secret — local development) is
 * not a failure to retry forever: it is skipped, loudly, as before.
 */
export async function deliverClientRevalidation(
  target: RevalidationTarget,
  reason: string,
): Promise<void> {
  const tags = unique(target.tags ?? [])
  const paths = unique(target.paths ?? [])
  if (tags.length === 0 && paths.length === 0) return

  const baseUrl = clientBaseUrl()
  const secret = revalidationSecret()
  if (!baseUrl || !secret) {
    console.warn('[public-revalidation] skipped: missing client URL or secret', { reason, tags, paths })
    return
  }

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
    throw new Error(`frontend revalidate answered ${response.status}: ${body.slice(0, 200)}`)
  }
}

/**
 * The inline, best-effort form: used when the outbox is switched off
 * (`REFRESH_OUTBOX=off`). Never throws.
 */
export async function triggerClientRevalidation(
  target: RevalidationTarget,
  reason: string,
): Promise<void> {
  try {
    await deliverClientRevalidation(target, reason)
  } catch (error) {
    console.error('[public-revalidation] failed', { reason, error, tags: target.tags, paths: target.paths })
  }
}
