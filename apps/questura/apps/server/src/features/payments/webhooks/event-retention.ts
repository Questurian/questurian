import type { getPayload } from 'payload'

/**
 * Drop processed Stripe webhook rows once they can no longer be retried.
 *
 * `stripe-webhook-events` exists so a Stripe retry of the same event id is a
 * no-op, and so an out-of-order subscription event cannot overwrite newer
 * state. Stripe stops retrying after about three days. After that the row is
 * only taking space. 30 days keeps dashboard "resend this event" replays
 * deduped without letting the table grow forever.
 */

export const WEBHOOK_EVENT_RETENTION_DAYS = 30

const MS_PER_DAY = 24 * 60 * 60 * 1000

export type WebhookEventRetentionStore = {
  countExpired: (cutoffIso: string) => Promise<number>
  deleteExpired: (cutoffIso: string) => Promise<number>
}

type PayloadApi = Pick<Awaited<ReturnType<typeof getPayload>>, 'find' | 'delete'>

const BATCH = 100
const expiredWhere = (cutoffIso: string) => ({ createdAt: { less_than: cutoffIso } })

/**
 * Payload adapter. Collection access is closed (`delete: () => false`), so
 * every call has to `overrideAccess`. `createdAt` is when we recorded the
 * event — pruning by Stripe `eventCreated` would drop a dashboard resend
 * of an old event before Stripe finished retrying that delivery.
 */
export function createPayloadWebhookEventStore(payload: PayloadApi): WebhookEventRetentionStore {
  return {
    async countExpired(cutoffIso) {
      const result = await payload.find({
        collection: 'stripe-webhook-events',
        where: expiredWhere(cutoffIso),
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      return result.totalDocs
    },

    async deleteExpired(cutoffIso) {
      let deleted = 0

      for (;;) {
        const batch = await payload.find({
          collection: 'stripe-webhook-events',
          where: expiredWhere(cutoffIso),
          limit: BATCH,
          depth: 0,
          overrideAccess: true,
        })

        if (batch.docs.length === 0) return deleted

        const before = deleted
        for (const doc of batch.docs) {
          await payload.delete({
            collection: 'stripe-webhook-events',
            id: doc.id,
            overrideAccess: true,
          })
          deleted += 1
        }

        if (deleted === before) {
          throw new Error('Webhook event prune deleted nothing from a non-empty batch')
        }
      }
    },
  }
}

export function webhookEventRetentionCutoff(now: Date): Date {
  return new Date(now.getTime() - WEBHOOK_EVENT_RETENTION_DAYS * MS_PER_DAY)
}

export async function pruneExpiredWebhookEvents(options: {
  apply: boolean
  now?: Date
  store: WebhookEventRetentionStore
}): Promise<{
  ok: boolean
  counts: { expired: number; deleted: number }
  lines: string[]
}> {
  const now = options.now ?? new Date()
  const cutoff = webhookEventRetentionCutoff(now)
  const cutoffIso = cutoff.toISOString()
  const expired = await options.store.countExpired(cutoffIso)
  const deleted = options.apply ? await options.store.deleteExpired(cutoffIso) : 0

  const lines = [
    `retention: ${WEBHOOK_EVENT_RETENTION_DAYS}d cutoff=${cutoffIso}`,
    `expired=${expired} deleted=${deleted} apply=${options.apply ? 1 : 0}`,
  ]

  return {
    ok: true,
    counts: { expired, deleted },
    lines,
  }
}
