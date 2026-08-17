/**
 * Verify: the live webhook endpoint sends everything this app handles
 *
 * Why this exists
 * ---------------
 * A webhook handler only runs if Stripe is configured to send its event, and
 * nothing in the codebase can see that configuration. `charge.refunded` and
 * `charge.dispute.*` were handled, tested and deployed for months while the
 * live endpoint had never had them enabled: every refund and every chargeback
 * silently left the visitor's access intact. No test could have caught it,
 * because the code was correct — the gap was in the Dashboard.
 *
 * This closes the loop from the other side. It reads the enabled events off the
 * live endpoint and diffs them against `HANDLED_STRIPE_EVENT_TYPES`, which is
 * derived from the dispatch map itself rather than written down a second time.
 *
 * What it reports
 * ---------------
 *   MISSING    Handled in code, not enabled on the endpoint. The handler is
 *              dead. This is the failure this script exists to find.
 *   EXTRA      Enabled on the endpoint, not handled in code. Harmless — it hits
 *              the "Unhandled Stripe event type" log — but usually means either
 *              a deliberate decision worth recording in
 *              DELIBERATELY_UNHANDLED_STRIPE_EVENTS, or a half-finished change.
 *   DISABLED   An endpoint whose status is not `enabled`. Reported so a
 *              correctly-configured but switched-off endpoint cannot look like
 *              a pass.
 *
 * Safety
 * ------
 * Read-only. Issues GET requests to Stripe and writes nothing, anywhere. Safe
 * against a live key.
 *
 * Usage:
 *   pnpm verify:stripe-webhook-events            # dev machine, via tsx
 *
 * Also callable as `run()` by `scripts/nightly-stripe-reconcile.ts`, which needs
 * the findings rather than an exit code. The CLI behaviour below is unchanged.
 *
 * On the deploy host there are no dev dependencies, so `tsx` does not exist.
 * Node strips the types itself there — but only from 22.6, and the host's
 * `/usr/bin/node` is 18, which rejects the flag outright. Use the nvm build:
 *
 *   cd ~/questura/app/apps/questura/apps/server
 *   set -a; . ~/questura/config/server.env; set +a
 *   ~/.nvm/versions/node/v22.23.2/bin/node \
 *     --experimental-strip-types scripts/verify-stripe-webhook-events.ts
 *
 * Confirmed working against the live account on 2026-08-16.
 *
 * Exits non-zero if any enabled endpoint is missing a handled event, so it can
 * gate a deploy.
 */

import { fileURLToPath } from 'node:url'

import Stripe from 'stripe'
// The dependency-free half of the contract, imported with an explicit extension
// so this runs under plain `node --experimental-strip-types` on a host that has
// no dev dependencies. Importing the handler map instead would pull in Payload
// and every handler, which is what made the first version of this script
// unrunnable anywhere it mattered.
import {
  DELIBERATELY_UNHANDLED_STRIPE_EVENTS,
  HANDLED_STRIPE_EVENT_TYPES,
} from '../src/features/payments/webhooks/event-contract.ts'
// Type-only, so it is erased before Node sees the file and adds no runtime
// dependency. That property is load-bearing here — see the header.
import type { ReconcileStepResult } from '../src/features/payments/lib/reconcile-report.ts'

function requireKey(): string {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not set.')
  }
  return key
}

/**
 * Which endpoint is ours. An account can hold endpoints for other integrations,
 * and failing the run because someone else's Zapier hook does not send
 * `charge.refunded` would make the check noise.
 */
const OUR_ENDPOINT_PATH = '/api/payments/webhooks/stripe'

export type VerifyWebhookEventsOptions = {
  /** Called as each line is produced, so a CLI run still streams. */
  onLine?: (line: string) => void
}

export async function run(
  options: VerifyWebhookEventsOptions = {}
): Promise<ReconcileStepResult> {
  const lines: string[] = []
  const emit = (line: string) => {
    lines.push(line)
    options.onLine?.(line)
  }

  const stripe = new Stripe(requireKey(), { typescript: true })
  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 })

  const ours = endpoints.data.filter((endpoint) => endpoint.url.includes(OUR_ENDPOINT_PATH))

  if (ours.length === 0) {
    emit(`FAIL: no webhook endpoint on this account points at ${OUR_ENDPOINT_PATH}`)
    return {
      ok: false,
      reason: 'no-endpoint',
      counts: { endpoints: 0, missing: 0, disabled: 0, extra: 0 },
      lines,
    }
  }

  // Counted rather than flagged so the nightly summary can say how bad it is.
  // `missing` counts only enabled endpoints: a disabled one is reported through
  // `disabled` and may be an intentional spare.
  let missingCount = 0
  let disabledCount = 0
  let extraCount = 0
  let failed = false

  for (const endpoint of ours) {
    const enabled = new Set(endpoint.enabled_events)
    // `*` is Stripe's "send everything", which satisfies any handled event.
    const sendsEverything = enabled.has('*')

    const missing = sendsEverything
      ? []
      : HANDLED_STRIPE_EVENT_TYPES.filter((type) => !enabled.has(type))
    const extra = endpoint.enabled_events.filter(
      (type) => type !== '*' && !HANDLED_STRIPE_EVENT_TYPES.includes(type as never)
    )
    extraCount += extra.length

    emit(`\n${endpoint.url}`)
    emit(`  status: ${endpoint.status}`)

    if (endpoint.status !== 'enabled') {
      disabledCount += 1
      emit('  DISABLED: this endpoint receives nothing regardless of its event list')
    }

    if (missing.length > 0) {
      for (const type of missing) {
        emit(`  MISSING: ${type} — handled in code, never delivered`)
      }
      // Only an enabled endpoint missing events is a live failure. A disabled
      // one is already reported above and may be an intentional spare.
      if (endpoint.status === 'enabled') {
        missingCount += missing.length
        failed = true
      }
    }

    for (const type of extra) {
      const reason = DELIBERATELY_UNHANDLED_STRIPE_EVENTS[type]
      emit(
        reason
          ? `  EXTRA (by decision): ${type} — ${reason}`
          : `  EXTRA: ${type} — delivered but not handled`
      )
    }

    if (missing.length === 0 && endpoint.status === 'enabled') {
      emit(`  OK: all ${HANDLED_STRIPE_EVENT_TYPES.length} handled events are enabled`)
    }
  }

  if (failed) {
    emit('\nFAIL: an enabled endpoint is missing events this app handles.')
  } else {
    emit('\nPASS: every handled event is enabled on every enabled endpoint.')
  }

  return {
    // A disabled endpoint is not a CLI failure today and stays one here; the
    // nightly escalates it through the `disabled` count instead.
    ok: !failed,
    counts: {
      endpoints: ours.length,
      missing: missingCount,
      disabled: disabledCount,
      extra: extraCount,
    },
    lines,
  }
}

// Unchanged CLI: streams the same report and still exits non-zero when an
// enabled endpoint is missing events, so it can keep gating a deploy.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run({ onLine: (line) => console.log(line) })
    .then((result) => process.exit(result.ok ? 0 : 1))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error)
      process.exit(1)
    })
}
