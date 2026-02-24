import type { CreateCheckoutSessionVariables } from '../types/subscription-mutations.types';

type EndorselyWindow = Window & {
  endorsely_referral?: string;
};

export function resolveCheckoutReferralId(
  variables?: CreateCheckoutSessionVariables
): string | null {
  if (process.env.NEXT_PUBLIC_ENDORSELY_ENABLED !== 'true') {
    return null;
  }

  const endorselyReferral =
    typeof window !== 'undefined'
      ? (window as EndorselyWindow).endorsely_referral
      : null;

  const referralId = variables?.referralId || endorselyReferral || null;

  if (referralId) {
    console.log('[Affiliate] User referred by:', referralId);
  }

  return referralId;
}
