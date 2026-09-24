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
})
