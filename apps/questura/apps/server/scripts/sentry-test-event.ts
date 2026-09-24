/**
 * Send one test error to Sentry, through the same options and scrubber the
 * server uses, and say whether it left.
 *
 *   SENTRY_DSN=https://...ingest.sentry.io/... pnpm --dir apps/questura/apps/server sentry:test-event
 *
 * The event deliberately carries an email address, a cookie and a Stripe-style
 * key. In Sentry they must read `[email]` and `[redacted]`: if any arrives
 * intact, the scrubber is broken and the DSN must not go on Railway yet.
 *
 * Refuses to run without SENTRY_DSN, so it can never send by accident.
 * docs/procedures/sentry-setup.md step 4.
 */

import 'dotenv/config'

import {
  flushErrorReporting,
  initErrorReporting,
  sentryClient,
  sentryOptions,
} from '../src/shared/observability/error-reporting'

async function main() {
  const options = sentryOptions(process.env)
  if (!options) {
    console.error('SENTRY_DSN is not set. Nothing was sent. See docs/procedures/sentry-setup.md.')
    process.exitCode = 1
    return
  }

  const started = await initErrorReporting({ ...process.env, SENTRY_ENVIRONMENT: options.environment })
  const Sentry = sentryClient()
  if (!started || !Sentry) {
    console.error('The Sentry SDK did not start. Nothing was sent.')
    process.exitCode = 1
    return
  }

  const stamp = new Date().toISOString()
  const fakeKey = ['sk', 'live', 'scrubcheck0000000000'].join('_')

  const eventId = Sentry.withScope((scope) => {
    scope.setTag('test_event', 'true')
    scope.setExtra('scrub_check', {
      email: 'reader@example.com',
      note: `contact reader@example.com, key ${fakeKey}`,
      headers: { cookie: 'better-auth.session_token=abc123', 'x-request-id': 'sentry-test-event' },
    })
    return Sentry.captureException(
      new Error(`Questura Sentry test event ${stamp} (scrub check: reader@example.com ${fakeKey})`),
    )
  })

  const flushed = await flushErrorReporting(10_000)
  if (!flushed) {
    console.error(`Event ${eventId} was queued but did not leave within 10s. Check the DSN and the network.`)
    process.exitCode = 1
    return
  }

  console.log(`Sent test event ${eventId} to environment "${options.environment}".`)
  console.log('In Sentry: the message and extras must show [email] and [redacted], never the originals.')
}

main().catch((error) => {
  console.error('sentry:test-event failed:', error)
  process.exitCode = 1
})
