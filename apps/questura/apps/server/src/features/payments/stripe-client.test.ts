import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'

vi.mock('@/shared/config', () => ({
  APP_CONFIG: {
    stripe: { secretKey: 'sk_test_client_config' },
  },
}))

const constructorCalls: Stripe.StripeConfig[] = []

// The real SDK reads these back only through internals that are not on the
// published type, so the config object handed to `new Stripe(...)` is the
// thing worth asserting on.
vi.mock('stripe', () => ({
  default: class {
    constructor(_key: string, config: Stripe.StripeConfig) {
      constructorCalls.push(config)
    }
  },
}))

/**
 * These assertions exist because the cost of losing them is invisible.
 *
 * Deleting `timeout` does not fail a build or any other test — it silently
 * restores stripe-node's 80s default, and the only symptom is a webhook that
 * Stripe gave up on minutes ago still holding a request open while the
 * redelivery runs alongside it.
 */
describe('getStripe', () => {
  beforeEach(() => {
    vi.resetModules()
    constructorCalls.length = 0
  })

  async function configure() {
    const stripeLib = await import('@/payments/lib/stripe')
    stripeLib.getStripe()
    expect(constructorCalls).toHaveLength(1)
    return { config: constructorCalls[0], stripeLib }
  }

  it('bounds a single request well inside the webhook response window', async () => {
    const { config } = await configure()

    // Not merely "set": 80000 is the SDK's own default, so a value that
    // happened to equal it would mean the option changed nothing.
    expect(config.timeout).toBe(8_000)
    expect(config.timeout).toBeLessThan(80_000)
  })

  it('retries once, so a timed-out call cannot cost three timeouts', async () => {
    const { config } = await configure()

    // The SDK retries a timed-out attempt, so this count multiplies the
    // timeout above. At the SDK default of 2 the worst case for one call is
    // ~26s, past the window Stripe allows a webhook endpoint to answer in.
    expect(config.maxNetworkRetries).toBe(1)

    // Above zero on purpose: stripe-node attaches its automatic
    // `Idempotency-Key` to a v1 POST only when retries are enabled, so
    // switching retries off would make a POST replay *less* safe, not more.
    expect(config.maxNetworkRetries).toBeGreaterThan(0)
  })

  it('still pins the reviewed API version', async () => {
    const { config, stripeLib } = await configure()

    expect(config.apiVersion).toBe(stripeLib.STRIPE_API_VERSION)
    expect(config.typescript).toBe(true)
  })

  it('configures the client once and reuses it', async () => {
    const { stripeLib } = await configure()

    stripeLib.getStripe()
    stripeLib.getStripe()

    expect(constructorCalls).toHaveLength(1)
  })
})
