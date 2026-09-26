import type { Metadata } from 'next';
import { Suspense } from 'react';
import PricingDisplay from '@/features/Payments/components/PricingDisplay';
import JoinHeroVisual from '@/features/Payments/components/JoinHeroVisual';
import { isLocalJoinPreview, LOCAL_JOIN_PLANS, readJoinPricing } from '@/features/Payments/lib/joinPlans';
import { config } from '@/lib/config';
import messages from '../../../messages/en.json';

export const metadata: Metadata = {
  title: 'Join Questurian — Every Article and Itinerary, One Membership',
  // No price here on purpose: metadata is static, so any figure in it would
  // drift from the Stripe price the page and checkout actually use.
  description:
    'One membership unlocks everything our travel experts publish — in-depth articles and day-by-day itineraries for every city we cover. Monthly or annual, cancel anytime.',
};

async function JoinPricing() {
  const { plans, taxAtCheckout } = await readJoinPricing(config.backendUrl, false);
  return <PricingDisplay plans={plans} taxAtCheckout={taxAtCheckout} />;
}

export default function JoinPage() {
  return (
    <>
      <JoinHeroVisual />
      {isLocalJoinPreview(config.frontendUrl) ? (
        <PricingDisplay plans={LOCAL_JOIN_PLANS} preview />
      ) : (
        <Suspense fallback={<p role="status" className="min-h-[560px] p-12 text-center">{messages.join.loadingPlans}</p>}>
          <JoinPricing />
        </Suspense>
      )}
    </>
  );
}
