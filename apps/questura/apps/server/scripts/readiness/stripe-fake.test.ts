import { describe, expect, it } from 'vitest'

import { FakeStripeAccount } from './stripe-fake'

const PRICES = { price_m: { amount: 1299, interval: 'month', currency: 'usd' } }

function paidAccount() {
  const account = new FakeStripeAccount(PRICES)
  const created = account.handle(
    'POST',
    new URL('http://127.0.0.1/v1/checkout/sessions'),
    'customer=cus_1&mode=subscription&line_items[0][price]=price_m&line_items[0][quantity]=1',
    {},
  )
  const sessionId = (created!.body as { id: string }).id
  const paid = account.completeCheckout(sessionId, 'buyer@example.com')!
  return { account, ...paid }
}

function get(account: FakeStripeAccount, path: string) {
  return account.handle('GET', new URL(`http://127.0.0.1${path}`), '', {})!
}

// The fake is what readiness:purchase proves refunds and disputes against, so
// it has to look like the pinned API version (basil), not the older version its
// captured template was recorded at. An old-shape fake is how the basil bug hid.
describe('readiness fake Stripe account', () => {
  it('shapes the paid invoice and its charge as basil does', () => {
    const { account, subscription, charge } = paidAccount()
    const invoice = account.invoices.get(String(subscription.latest_invoice))!

    for (const field of ['paid', 'charge', 'payment_intent', 'subscription', 'subscription_details']) {
      expect(invoice, field).not.toHaveProperty(field)
    }
    expect(invoice.parent).toMatchObject({ subscription_details: { subscription: subscription.id } })
    expect(charge).not.toHaveProperty('invoice')
    expect(charge.payment_intent).toMatch(/^pi_/)
  })

  it('finds the invoice a payment intent paid, and counts the lookup', () => {
    const { account, subscription, charge } = paidAccount()
    const query = `payment%5Btype%5D=payment_intent&payment%5Bpayment_intent%5D=${String(charge.payment_intent)}`

    const found = get(account, `/v1/invoice_payments?${query}`)
    const other = get(account, '/v1/invoice_payments?payment%5Btype%5D=payment_intent&payment%5Bpayment_intent%5D=pi_other')

    expect(found.body).toMatchObject({ data: [{ invoice: subscription.latest_invoice, status: 'paid' }] })
    expect(other.body).toMatchObject({ data: [] })
    expect(account.invoicePaymentLookups).toBe(2)
  })

  it('includes an invoice\'s payments only when expanded', () => {
    const { account, subscription } = paidAccount()
    const id = String(subscription.latest_invoice)

    expect(get(account, `/v1/invoices/${id}`).body).not.toHaveProperty('payments')
    expect(get(account, `/v1/invoices/${id}?expand%5B0%5D=payments`).body).toMatchObject({
      payments: { data: [{ payment: { type: 'payment_intent' } }] },
    })
  })

  it('refunds part of a charge, then the rest', () => {
    const { account, charge } = paidAccount()

    expect(account.refundCharge(charge.id, 100)).toMatchObject({ amount_refunded: 100, refunded: false })
    expect(account.refundCharge(charge.id)).toMatchObject({ amount_refunded: 1299, refunded: true })
    expect(account.refunds).toHaveLength(2)
  })

  it('opens a dispute that names its charge by id, and closes it', () => {
    const { account, charge } = paidAccount()

    const dispute = account.openDispute(charge.id)!
    expect(dispute).toMatchObject({ charge: charge.id, status: 'needs_response' })
    expect(get(account, `/v1/charges/${charge.id}`).body).toMatchObject({ disputed: true })
    expect(account.closeDispute(dispute.id, 'lost')).toMatchObject({ status: 'lost' })
  })

  // Launch fix plan item 11. Stripe replays an idempotent create with the
  // response it first gave, so only a read shows a session has since been paid.
  it('replays a create as first answered, and a read shows the session now', () => {
    const account = new FakeStripeAccount(PRICES)
    const create = () =>
      account.handle('POST', new URL('http://127.0.0.1/v1/checkout/sessions'), 'customer=cus_1&mode=subscription&line_items[0][price]=price_m', {
        idempotencyKey: 'k1',
      })!
    const id = (create().body as { id: string }).id
    account.completeCheckout(id)

    expect(create().body).toMatchObject({ id, status: 'open' })
    expect(get(account, `/v1/checkout/sessions/${id}`).body).toMatchObject({ id, status: 'complete' })
  })

  // Deleting a customer in the Dashboard cancels its subscriptions, and Stripe
  // then refuses new work on it while still answering a read with a stub.
  it('deletes a customer the way Stripe does', () => {
    const { account, subscription } = paidAccount()

    account.deleteCustomer('cus_1')

    expect(account.subscriptions.get(subscription.id)?.status).toBe('canceled')
    expect(get(account, '/v1/customers/cus_1').body).toEqual({ id: 'cus_1', object: 'customer', deleted: true })
    const refused = account.handle('POST', new URL('http://127.0.0.1/v1/checkout/sessions'), 'customer=cus_1&mode=subscription&line_items[0][price]=price_m', {})!
    expect(refused.status).toBe(400)
    const portal = account.handle('POST', new URL('http://127.0.0.1/v1/billing_portal/sessions'), 'customer=cus_1', {})!
    expect(portal.status).toBe(400)
  })

  describe('Managed Payments', () => {
    const BASE = 'customer=cus_1&mode=subscription&line_items[0][price]=price_m&line_items[0][quantity]=1&billing_address_collection=auto&subscription_data[metadata][visitorAuthUserId]=v1'
    const create = (body: string) => new FakeStripeAccount(PRICES).handle('POST', new URL('http://127.0.0.1/v1/checkout/sessions'), body, {})!

    it('opens a managed session, records it, and pays it like any other', () => {
      const account = new FakeStripeAccount(PRICES)
      const created = account.handle('POST', new URL('http://127.0.0.1/v1/checkout/sessions'), `${BASE}&managed_payments[enabled]=true`, {})!
      expect(created.status).toBe(200)
      const id = (created.body as { id: string }).id
      expect(account.sessions.get(id)).toMatchObject({ _managedPayments: true, _paymentMethodTypes: null })
      expect(created.body).not.toHaveProperty('_managedPayments')
      expect(account.completeCheckout(id, 'buyer@example.com')?.subscription).toMatchObject({ status: 'active' })
    })

    it('records an unmanaged session as unmanaged', () => {
      const account = new FakeStripeAccount(PRICES)
      const created = account.handle('POST', new URL('http://127.0.0.1/v1/checkout/sessions'), `${BASE}&payment_method_types[0]=card&payment_method_types[1]=link`, {})!
      expect(account.sessions.get((created.body as { id: string }).id)).toMatchObject({ _managedPayments: false, _paymentMethodTypes: ['card', 'link'] })
      expect(create(`${BASE}&managed_payments[enabled]=false&payment_method_types[0]=card`).status).toBe(200)
    })

    // Stripe answers 400 to these on a managed session; the fake must too, or
    // the sandbox would bless a checkout real Stripe refuses.
    it.each([
      'payment_method_types[0]=card',
      'payment_method_configuration=pmc_1',
      'automatic_tax[enabled]=true',
      'tax_id_collection[enabled]=true',
      'adaptive_pricing[enabled]=true',
      'invoice_creation[enabled]=true',
      'customer_update[name]=auto',
      'customer_update[address]=auto',
      'shipping_address_collection[allowed_countries][0]=US',
      'subscription_data[default_tax_rates][0]=txr_1',
      'subscription_data[invoice_settings][issuer][type]=self',
      'subscription_data[on_behalf_of]=acct_1',
    ])('refuses %s alongside managed_payments', (extra) => {
      const refused = create(`${BASE}&managed_payments[enabled]=true&${extra}`)
      expect(refused.status).toBe(400)
      expect(refused.body).toMatchObject({ error: { type: 'invalid_request_error', param: expect.stringMatching(/^[a-z_]+(\[[a-z_]+\])?$/) } })
    })

    it('refuses a malformed managed_payments', () => {
      expect(create(`${BASE}&managed_payments[enabled]=yes`).status).toBe(400)
      expect(create(`${BASE}&managed_payments[enabled]=true&managed_payments[other]=1`).status).toBe(400)
      expect(create(`${BASE}&managed_payments=true`).status).toBe(400)
    })
  })
})
