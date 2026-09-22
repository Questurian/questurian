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

/**
 * The frontend refuses a request carrying more than a hundred tags or a
 * hundred paths (`apps/client/src/app/api/revalidate/route.ts`). The backend
 * sent the whole target in one request and treated the resulting 400 as a
 * delivery failure, so a large fan-out — an author with a few hundred
 * published articles renaming their slug — retried eight times and then sat
 * in `failed`, with none of its pages refreshed.
 *
 * Chunking is the fix, and it is deliberately not truncation. Every chunk
 * must be acknowledged before the job is done; a chunk that fails throws, the
 * job stays pending, and the retry replays *all* of them. Replaying an
 * already-delivered chunk costs one wasted request, because revalidation is
 * idempotent — whereas dropping the remainder costs a page nobody will ever
 * refresh again.
 */
export const MAX_TARGETS_PER_REQUEST = 100

export class RevalidationUnconfigured extends Error {
  constructor(missing: string) {
    super(
      `Cannot deliver revalidation: ${missing} is not configured. The job stays pending and will be retried; ` +
        `set the frontend destination and secret, or set REFRESH_DISCONNECTED=1 in development to skip delivery on purpose.`,
    )
    this.name = 'RevalidationUnconfigured'
  }
}

/**
 * Split a target into requests the frontend will accept.
 *
 * Deterministic: the same target always produces the same chunks in the same
 * order, so a replay after a partial failure repeats identical requests
 * rather than a differently-sliced set.
 */
export function chunkTarget(
  tags: string[],
  paths: string[],
  size = MAX_TARGETS_PER_REQUEST,
): Array<{ tags: string[]; paths: string[] }> {
  const chunks: Array<{ tags: string[]; paths: string[] }> = []

  for (let index = 0; index < tags.length; index += size) {
    chunks.push({ tags: tags.slice(index, index + size), paths: [] })
  }
  for (let index = 0; index < paths.length; index += size) {
    chunks.push({ tags: [], paths: paths.slice(index, index + size) })
  }

  return chunks.length > 0 ? chunks : [{ tags: [], paths: [] }]
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

  const chunks = chunkTarget(tags, paths)

  // Sequential on purpose. These are invalidations, not reads: firing a
  // hundred at once at the frontend during a large rename is a self-inflicted
  // burst on the machine that is also serving readers.
  for (const [index, chunk] of chunks.entries()) {
    const response = await fetch(`${baseUrl}/api/revalidate`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-revalidation-secret': secret,
      },
      signal: AbortSignal.timeout(REVALIDATION_TIMEOUT_MS),
      body: JSON.stringify(chunk),
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(
        `frontend revalidate answered ${response.status} on chunk ${index + 1} of ${chunks.length}: ` +
          body.slice(0, 200),
      )
    }
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
