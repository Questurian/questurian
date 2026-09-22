import { describe, expect, it } from 'vitest'

import { sandboxStripeHost } from './stripe'

/**
 * The readiness seam must not be a way to point payments anywhere real.
 */
describe('sandboxStripeHost', () => {
  it('is off without the sandbox flag, whatever else is set', () => {
    expect(sandboxStripeHost({ READINESS_STRIPE_STUB_URL: 'http://127.0.0.1:3191' })).toBeNull()
  })

  it('is off when no stub is named', () => {
    expect(sandboxStripeHost({ READINESS_SANDBOX: '1' })).toBeNull()
  })

  it('points the SDK at a loopback stub', () => {
    expect(sandboxStripeHost({ READINESS_SANDBOX: '1', READINESS_STRIPE_STUB_URL: 'http://127.0.0.1:3191' })).toEqual({
      host: '127.0.0.1',
      port: 3191,
      protocol: 'http',
    })
  })

  it.each(['http://evil.example:3191', 'https://127.0.0.1:3191', 'http://localhost:3191', 'http://127.0.0.1'])(
    'refuses %s',
    (url) => {
      expect(() => sandboxStripeHost({ READINESS_SANDBOX: '1', READINESS_STRIPE_STUB_URL: url })).toThrow(
        'must be http://127.0.0.1',
      )
    },
  )
})
