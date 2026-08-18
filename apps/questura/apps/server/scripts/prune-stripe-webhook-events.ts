/**
 * Prune processed Stripe webhook rows older than the retention window
 *
 * Why this exists
 * ---------------
 * Every delivered event is recorded in `stripe-webhook-events` so Stripe
 * retries are skipped and a stale subscription event cannot overwrite newer
 * state. Nothing used to delete those rows. Stripe stops retrying after about
 * three days; after that the row is only taking space.
 *
 * Safety
 * ------
 * Dry-run by default: prints the expired count and writes nothing. Pass
 * `--apply` to delete. Honours `QUESTURA_RECONCILE_APPLY` when the nightly
 * orchestrator calls `run({ apply })`.
 *
 * Usage:
 *   pnpm prune:stripe-webhook-events
 *   pnpm prune:stripe-webhook-events -- --apply
 *
 * Also callable as `run(options)` by `scripts/nightly-stripe-reconcile.ts`.
 */

import 'dotenv/config'
import { fileURLToPath } from 'node:url'

import { getPayload } from 'payload'

import {
  createPayloadWebhookEventStore,
  pruneExpiredWebhookEvents,
} from '../src/features/payments/webhooks/event-retention'
import type { ReconcileStepResult } from '../src/features/payments/lib/reconcile-report'
import config from '../src/payload.config'

export type PruneWebhookEventsOptions = {
  apply?: boolean
  onLine?: (line: string) => void
}

export async function run(
  options: PruneWebhookEventsOptions = {}
): Promise<ReconcileStepResult> {
  const payload = await getPayload({ config })
  const result = await pruneExpiredWebhookEvents({
    apply: options.apply ?? false,
    store: createPayloadWebhookEventStore(payload),
  })

  for (const line of result.lines) options.onLine?.(line)

  return result
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run({
    apply: process.argv.includes('--apply'),
    onLine: (line) => console.log(line),
  })
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Webhook event prune failed:', error)
      process.exit(1)
    })
}
