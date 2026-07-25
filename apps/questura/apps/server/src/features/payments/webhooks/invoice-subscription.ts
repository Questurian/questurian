import type Stripe from 'stripe'
import { stripe } from '@/payments/lib/stripe'
import { logger } from '@/shared/utils/logger'

type InvoiceWithSubscription = Stripe.Invoice & {
  subscription?: string | Stripe.Subscription | null
  subscription_id?: string | Stripe.Subscription | null
  parent?: {
    subscription_details?: {
      subscription?: string | Stripe.Subscription | null
    } | null
  } | null
}

function subscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const invoiceData = invoice as InvoiceWithSubscription
  const subscription =
    invoiceData.subscription ??
    invoiceData.subscription_id ??
    invoiceData.parent?.subscription_details?.subscription

  if (typeof subscription === 'string') {
    return subscription
  }

  return subscription?.id ?? null
}

/**
 * Invoice webhook payloads do not always include their subscription relation.
 * Resolve it from the payload when possible, then fetch the full invoice as a
 * fallback so success and failure handlers behave consistently.
 */
export async function resolveInvoiceSubscriptionId(invoice: Stripe.Invoice): Promise<string | null> {
  const subscriptionId = subscriptionIdFromInvoice(invoice)
  if (subscriptionId) {
    return subscriptionId
  }

  try {
    if (!invoice.id) {
      throw new Error('Invoice ID is missing')
    }

    return subscriptionIdFromInvoice(await stripe.invoices.retrieve(invoice.id))
  } catch (error) {
    logger.error('Error fetching invoice from Stripe API', {
      invoiceId: invoice.id,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}
