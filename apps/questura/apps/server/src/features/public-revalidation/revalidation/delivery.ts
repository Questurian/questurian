import { clientBaseUrl, REVALIDATION_TIMEOUT_MS, revalidationDisconnected, revalidationSecret } from './env'
import { unique } from './cache-tags'
import type { RevalidationTarget } from './types'

/**
 * Tell the frontend to revalidate, and throw if it did not.
 *
 * The refresh outbox (`features/refresh-outbox`) decides whether to retry
 * from whether this throws, so the set of things that count as "delivered"
 * has to be exactly the set of things the frontend actually acknowledged.
 * It used to include "there was no frontend configured", which is how a
 * deployment missing one environment variable could drain its whole queue to
 * `done` without a single page being refreshed.
 */

export type DeliveryOutcome = 'delivered' | 'skipped-disconnected'

export class RevalidationUnconfigured extends Error {
  constructor(missing: string) {
    super(
      `Cannot deliver revalidation: ${missing} is not configured. The job stays pending and will be retried; ` +
        `set the frontend destination and secret, or set REFRESH_DISCONNECTED=1 in development to skip delivery on purpose.`,
    )
    this.name = 'RevalidationUnconfigured'
  }
}

export async function deliverClientRevalidation(
  target: RevalidationTarget,
  reason: string,
): Promise<DeliveryOutcome> {
  const tags = unique(target.tags ?? [])
  const paths = unique(target.paths ?? [])
  if (tags.length === 0 && paths.length === 0) return 'delivered'

  const baseUrl = clientBaseUrl()
  const secret = revalidationSecret()

  if (!baseUrl || !secret) {
    // Explicit, declared development mode: the job is not retried forever,
    // but it is never called delivered either.
    if (revalidationDisconnected()) {
      console.warn('[public-revalidation] skipped: REFRESH_DISCONNECTED is set', { reason, tags, paths })
      return 'skipped-disconnected'
    }
    throw new RevalidationUnconfigured(!baseUrl ? 'the frontend URL' : 'the revalidation secret')
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

  return 'delivered'
}

/**
 * The inline, best-effort form: used when the outbox is switched off
 * (`REFRESH_OUTBOX=off`). Never throws — which is exactly why the outbox
 * being off is a degraded mode production has to acknowledge.
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
