import type { MembershipPlan } from './planPresentation';

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

/** Public, cached server read: no cookies, browser waterfall, or Stripe SDK. */
export async function readJoinPlans(
  backendUrl: string,
  preview: boolean,
  request: typeof fetch = fetch,
): Promise<MembershipPlan[]> {
  if (preview) return LOCAL_JOIN_PLANS;

  try {
    const response = await request(`${backendUrl}/api/payments/plans`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data?.plans) ? data.plans : [];
  } catch {
    // Live failures never fall back to the local fixtures.
    return [];
  }
}
