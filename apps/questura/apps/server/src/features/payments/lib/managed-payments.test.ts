import { describe, expect, it } from 'vitest'

import { toManagedCheckoutParams, type CheckoutSessionCreateParams } from './managed-payments'
import { parseStripeManagedPayments } from '@/shared/config/stripe-managed-payments'

describe('parseStripeManagedPayments', () => {
  it('is off when unset, empty or off', () => {
    for (const raw of [undefined, '', '  ', 'off', 'OFF', ' off ']) {
      expect(parseStripeManagedPayments(raw), String(raw)).toEqual({ enabled: false, problem: null })
    }
  })

  it('is on only for on', () => {
    for (const raw of ['on', 'ON', ' On ']) {
      expect(parseStripeManagedPayments(raw), raw).toEqual({ enabled: true, problem: null })
    }
  })

  // An operator who typed `true` believes tax is being handled. It is not, so
  // the value is off and production refuses to boot on the problem.
  it('refuses anything else, and reads it as off', () => {
    for (const raw of ['true', '1', 'yes', 'enabled', 'onn', 'on,off']) {
      const parsed = parseStripeManagedPayments(raw)
      expect(parsed.enabled, raw).toBe(false)
      expect(parsed.problem, raw).toMatch(/STRIPE_MANAGED_PAYMENTS is set to an unknown value — expected one of: on, off/)
    }
  })
})

describe('toManagedCheckoutParams', () => {
  // Every parameter Stripe lists as unavailable on a managed subscription
  // session (docs.stripe.com/payments/managed-payments/update-checkout).
  const everything = {
    customer: 'cus_1',
    mode: 'subscription',
    line_items: [{ price: 'price_1', quantity: 1 }],
    success_url: 'https://example.com/ok',
    cancel_url: 'https://example.com/cancel',
    metadata: { visitorAuthUserId: 'v1' },
    allow_promotion_codes: true,
    billing_address_collection: 'auto',
    payment_method_options: { card: { request_three_d_secure: 'challenge' } },
    adaptive_pricing: { enabled: true },
    automatic_tax: { enabled: true },
    tax_id_collection: { enabled: true },
    payment_method_configuration: 'pmc_1',
    payment_method_types: ['card', 'link'],
    shipping_address_collection: { allowed_countries: ['US'] },
    shipping_options: [{ shipping_rate: 'shr_1' }],
    invoice_creation: { enabled: true },
    customer_update: { name: 'auto', address: 'auto', shipping: 'auto' },
    subscription_data: {
      metadata: { visitorAuthUserId: 'v1' },
      default_tax_rates: ['txr_1'],
      invoice_settings: { issuer: { type: 'self' } },
      application_fee_percent: 10,
      on_behalf_of: 'acct_1',
      transfer_data: { destination: 'acct_2' },
    },
  } as unknown as CheckoutSessionCreateParams

  it('enables Managed Payments and removes everything Stripe forbids', () => {
    expect(toManagedCheckoutParams(everything)).toEqual({
      customer: 'cus_1',
      mode: 'subscription',
      line_items: [{ price: 'price_1', quantity: 1 }],
      success_url: 'https://example.com/ok',
      cancel_url: 'https://example.com/cancel',
      metadata: { visitorAuthUserId: 'v1' },
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      payment_method_options: { card: { request_three_d_secure: 'challenge' } },
      customer_update: { shipping: 'auto' },
      subscription_data: { metadata: { visitorAuthUserId: 'v1' } },
      managed_payments: { enabled: true },
    })
  })

  it('drops customer_update when nothing allowed is left in it', () => {
    const managed = toManagedCheckoutParams({
      ...everything,
      customer_update: { name: 'auto', address: 'auto' },
    } as CheckoutSessionCreateParams)
    expect(managed).not.toHaveProperty('customer_update')
  })

  it('leaves the unmanaged params untouched', () => {
    const before = JSON.stringify(everything)
    toManagedCheckoutParams(everything)
    expect(JSON.stringify(everything)).toBe(before)
  })
})
