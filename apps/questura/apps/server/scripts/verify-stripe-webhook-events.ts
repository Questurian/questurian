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
 *   STRIPE_SECRET_KEY=... pnpm tsx scripts/verify-stripe-webhook-events.ts
 *
 * Exits non-zero if any enabled endpoint is missing a handled event, so it can
 * gate a deploy.
 */

import Stripe from 'stripe'
import {
  DELIBERATELY_UNHANDLED_STRIPE_EVENTS,
  HANDLED_STRIPE_EVENT_TYPES,
} from '../src/features/payments/webhooks/handled-events'

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

async function main() {
  const stripe = new Stripe(requireKey(), { typescript: true })
  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 })

  const ours = endpoints.data.filter((endpoint) => endpoint.url.includes(OUR_ENDPOINT_PATH))

  if (ours.length === 0) {
    console.error(`FAIL: no webhook endpoint on this account points at ${OUR_ENDPOINT_PATH}`)
    process.exit(1)
  }

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

    console.log(`\n${endpoint.url}`)
    console.log(`  status: ${endpoint.status}`)

    if (endpoint.status !== 'enabled') {
      console.log('  DISABLED: this endpoint receives nothing regardless of its event list')
    }

    if (missing.length > 0) {
      for (const type of missing) {
        console.log(`  MISSING: ${type} — handled in code, never delivered`)
      }
      // Only an enabled endpoint missing events is a live failure. A disabled
      // one is already reported above and may be an intentional spare.
      if (endpoint.status === 'enabled') failed = true
    }

    for (const type of extra) {
      const reason = DELIBERATELY_UNHANDLED_STRIPE_EVENTS[type]
      console.log(
        reason
          ? `  EXTRA (by decision): ${type} — ${reason}`
          : `  EXTRA: ${type} — delivered but not handled`
      )
    }

    if (missing.length === 0 && endpoint.status === 'enabled') {
      console.log(`  OK: all ${HANDLED_STRIPE_EVENT_TYPES.length} handled events are enabled`)
    }
  }

  if (failed) {
    console.error('\nFAIL: an enabled endpoint is missing events this app handles.')
    process.exit(1)
  }

  console.log('\nPASS: every handled event is enabled on every enabled endpoint.')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
