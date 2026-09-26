/**
 * `STRIPE_MANAGED_PAYMENTS`: whether new Checkout Sessions use Stripe Managed
 * Payments (Stripe as merchant of record; see
 * `features/payments/lib/managed-payments.ts`). Kept import-free, like
 * `trusted-proxy.ts`, because the config module and the production checks
 * both read it.
 */
export const STRIPE_MANAGED_PAYMENTS_SETTINGS = ['on', 'off'] as const

/**
 * Read `STRIPE_MANAGED_PAYMENTS`. Unset or empty is off; case and surrounding
 * spaces are ignored. Anything other than `on` or `off` is off *and* a
 * problem, which production refuses to boot on (`assert-production-config.ts`):
 * a `true`, `1` or `yes` must not look like a switch somebody flipped while
 * checkout quietly stays unmanaged.
 */
export function parseStripeManagedPayments(raw: string | undefined): { enabled: boolean; problem: string | null } {
  const value = raw?.trim().toLowerCase() ?? ''
  if (value === '' || value === 'off') return { enabled: false, problem: null }
  if (value === 'on') return { enabled: true, problem: null }
  return {
    enabled: false,
    problem: `STRIPE_MANAGED_PAYMENTS is set to an unknown value — expected one of: ${STRIPE_MANAGED_PAYMENTS_SETTINGS.join(', ')}.`,
  }
}
