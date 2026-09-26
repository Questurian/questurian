import type { MembershipPlan } from './planPresentation';

/** What /join renders: the plans, and whether checkout adds tax. */
export type JoinPricing = { plans: MembershipPlan[]; taxAtCheckout: boolean };

// Presentation fixtures only. Never passed to a checkout request.
export const LOCAL_JOIN_PLANS: MembershipPlan[] = [
  { id: 'monthly', priceId: '', amount: 1299, currency: 'usd', interval: 'month', intervalCount: 1, productName: 'Questurian Membership', compareAtAmount: null },
  { id: 'yearly', priceId: '', amount: 7999, currency: 'usd', interval: 'year', intervalCount: 1, productName: 'Questurian Membership', compareAtAmount: null },
];

export function isLocalJoinPreview(frontendUrl: string): boolean {
  try {
    return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(frontendUrl).hostname);
  } catch {
    return false;
  }
}

/**
 * Public, cached server read: no cookies, browser waterfall, or Stripe SDK.
 *
 * `taxAtCheckout` is true only when the server says so. The local preview and
 * any failed or malformed read say false: the page then makes no tax promise,
 * which is the safe side (a "plus tax" line over a checkout that adds none is
 * the bug this replaced).
 */
export async function readJoinPricing(
  backendUrl: string,
  preview: boolean,
  request: typeof fetch = fetch,
): Promise<JoinPricing> {
  if (preview) return { plans: LOCAL_JOIN_PLANS, taxAtCheckout: false };

  try {
    const response = await request(`${backendUrl}/api/payments/plans`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return { plans: [], taxAtCheckout: false };
    const data = await response.json();
    return {
      plans: Array.isArray(data?.plans) ? data.plans : [],
      taxAtCheckout: data?.taxAtCheckout === true,
    };
  } catch {
    // Live failures never fall back to the local fixtures.
    return { plans: [], taxAtCheckout: false };
  }
}
