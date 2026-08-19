/**
 * The advisory-lock key that guards a Visitor profile's subscription state.
 *
 * Keyed on the *customer*, not the subscription, because the row being written
 * is keyed on neither: a profile holds one subscription, a customer accumulates
 * many, and every one of them writes the same `visitor-profiles` row. Two
 * subscriptions of one customer used to take two different keys, so a delayed
 * `customer.subscription.updated` for the old one could run concurrently with
 * the checkout collapse that replaced it, read-decide-write against a snapshot
 * the collapse had already invalidated, and leave the profile pointing at a
 * cancelled, refunded subscription while the live one billed silently.
 *
 * `ownsProfileRow` (see `subscription-resync.ts`) decides *whether* a
 * subscription may write the row; this key is what makes that decision atomic
 * with the write that follows it. Both need the same scope to be worth
 * anything, and the row's scope is the customer.
 *
 * Shared by every writer of that row — the webhook resync and the nightly
 * reconcile apply pass — so the two cannot drift onto keys that fail to
 * exclude each other.
 */
export function customerLockKey(customerId: string): string {
  return `stripe:customer:${customerId}`
}
