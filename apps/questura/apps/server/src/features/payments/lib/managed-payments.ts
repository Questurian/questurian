import type Stripe from 'stripe'

/**
 * Stripe Managed Payments: Stripe (through Link) becomes the merchant of
 * record, so sales tax, VAT and GST are calculated, collected, filed and
 * remitted by Stripe instead of by us.
 *
 * Off unless `STRIPE_MANAGED_PAYMENTS=on` (`shared/config/stripe-managed-payments.ts`). Stripe has to approve the account
 * first (Dashboard → Settings → Managed Payments, accept its terms), and the
 * membership product needs an eligible tax code, so the switch ships off and
 * is flipped by config once both are true. Move-day steps:
 * `apps/questura/docs/procedures/cutover.md`.
 *
 * Only new Checkout Sessions are affected. A subscription bought while the
 * switch was off stays an ordinary subscription for its whole life.
 *
 * The pinned SDK (stripe 18.5) predates the parameter, so it is typed here.
 * The SDK form-encodes it like any other nested object:
 * `managed_payments[enabled]=true`. Needs API 2025-03-31.basil or later; the
 * pin is 2025-08-27.basil (`stripe-api-version.ts`).
 *
 * Docs: https://docs.stripe.com/payments/managed-payments/update-checkout
 */
export type CheckoutSessionCreateParams = Stripe.Checkout.SessionCreateParams & {
  managed_payments?: { enabled: boolean }
}

/**
 * Top-level Checkout Session parameters Stripe refuses on a managed
 * subscription session. Stripe runs these itself as merchant of record: the
 * tax, the payment methods (dynamic, chosen per buyer), the customer's name
 * and address (it updates the customer we pass), currency (Adaptive Pricing is
 * always on), shipping and post-sale emails.
 */
const FORBIDDEN_TOP_LEVEL = [
  'adaptive_pricing',
  'automatic_tax',
  'tax_id_collection',
  'payment_method_configuration',
  'payment_method_types',
  'shipping_address_collection',
  'shipping_options',
  'invoice_creation',
] as const

/** The same, inside `subscription_data`. The Connect ones never apply here. */
const FORBIDDEN_IN_SUBSCRIPTION_DATA = [
  'default_tax_rates',
  'invoice_settings',
  'application_fee_percent',
  'on_behalf_of',
  'transfer_data',
] as const

/** Inside `customer_update`; `customer_update.shipping` is not listed by Stripe. */
const FORBIDDEN_IN_CUSTOMER_UPDATE = ['name', 'address'] as const

/**
 * The managed version of a session: `managed_payments[enabled]=true`, and
 * every parameter Stripe forbids for it removed. Returns a new object; the
 * input (today's unmanaged params) is not touched.
 *
 * Of what the route sends today only `payment_method_types` goes. The rest are
 * removed so a later edit that adds one cannot turn every managed checkout
 * into a 400. `billing_address_collection`, `allow_promotion_codes`,
 * `payment_method_options.card.request_three_d_secure`, metadata and
 * `subscription_data.metadata` are allowed and kept.
 */
export function toManagedCheckoutParams(params: CheckoutSessionCreateParams): CheckoutSessionCreateParams {
  const managed: Record<string, unknown> = { ...params }
  for (const key of FORBIDDEN_TOP_LEVEL) delete managed[key]

  if (params.subscription_data) {
    const subscriptionData: Record<string, unknown> = { ...params.subscription_data }
    for (const key of FORBIDDEN_IN_SUBSCRIPTION_DATA) delete subscriptionData[key]
    managed.subscription_data = subscriptionData
  }

  if (params.customer_update) {
    const customerUpdate: Record<string, unknown> = { ...params.customer_update }
    for (const key of FORBIDDEN_IN_CUSTOMER_UPDATE) delete customerUpdate[key]
    if (Object.keys(customerUpdate).length > 0) managed.customer_update = customerUpdate
    else delete managed.customer_update
  }

  managed.managed_payments = { enabled: true }
  return managed as CheckoutSessionCreateParams
}
