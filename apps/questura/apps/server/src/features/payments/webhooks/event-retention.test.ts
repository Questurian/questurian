import { describe, expect, it, vi } from 'vitest'

import {
  WEBHOOK_EVENT_RETENTION_DAYS,
  createPayloadWebhookEventStore,
  pruneExpiredWebhookEvents,
  webhookEventRetentionCutoff,
} from './event-retention'

describe('webhookEventRetentionCutoff', () => {
  it('is 30 days before now, which is past Stripe retry and short of forever', () => {
    const now = new Date('2026-08-17T00:00:00.000Z')
    const cutoff = webhookEventRetentionCutoff(now)

    expect(WEBHOOK_EVENT_RETENTION_DAYS).toBe(30)
    expect(cutoff.toISOString()).toBe('2026-07-18T00:00:00.000Z')
  })
})

describe('pruneExpiredWebhookEvents', () => {
  it('counts expired rows and deletes nothing on a dry run', async () => {
    const deleteExpired = vi.fn()

    const result = await pruneExpiredWebhookEvents({
      apply: false,
      now: new Date('2026-08-17T00:00:00.000Z'),
      store: {
        countExpired: async () => 12,
        deleteExpired,
      },
    })

    expect(result.counts).toEqual({ expired: 12, deleted: 0 })
    expect(deleteExpired).not.toHaveBeenCalled()
    expect(result.ok).toBe(true)
  })

  it('deletes the expired rows when apply is on', async () => {
    const deleteExpired = vi.fn(async () => 12)

    const result = await pruneExpiredWebhookEvents({
      apply: true,
      now: new Date('2026-08-17T00:00:00.000Z'),
      store: {
        countExpired: async () => 12,
        deleteExpired,
      },
    })

    expect(deleteExpired).toHaveBeenCalledWith('2026-07-18T00:00:00.000Z')
    expect(result.counts).toEqual({ expired: 12, deleted: 12 })
  })
})

describe('createPayloadWebhookEventStore', () => {
  it('counts and deletes by our createdAt, not Stripe eventCreated', async () => {
    let remaining = [{ id: 3 }, { id: 4 }]
    const payload = {
      find: vi.fn(async () => ({
        docs: remaining.slice(0, 100),
        totalDocs: remaining.length,
      })),
      delete: vi.fn(async ({ id }: { id: number }) => {
        remaining = remaining.filter((doc) => doc.id !== id)
        return {}
      }),
    }

    const store = createPayloadWebhookEventStore(payload as never)
    const cutoff = '2026-07-18T00:00:00.000Z'

    await expect(store.countExpired(cutoff)).resolves.toBe(2)
    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'stripe-webhook-events',
        where: { createdAt: { less_than: cutoff } },
        overrideAccess: true,
      })
    )

    await expect(store.deleteExpired(cutoff)).resolves.toBe(2)
    expect(payload.delete).toHaveBeenCalledWith({
      collection: 'stripe-webhook-events',
      id: 3,
      overrideAccess: true,
    })
    expect(payload.delete).toHaveBeenCalledWith({
      collection: 'stripe-webhook-events',
      id: 4,
      overrideAccess: true,
    })
  })
})
