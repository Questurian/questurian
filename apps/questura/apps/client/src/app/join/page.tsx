import type { Metadata } from 'next';
import PricingDisplay from '@/features/Payments/components/PricingDisplay';

export const metadata: Metadata = {
  title: 'Join Questurian — Every Article and Itinerary, One Membership',
  // No price here on purpose: metadata is static, so any figure in it would
  // drift from the Stripe price the page and checkout actually use.
  description:
    'One membership unlocks everything our travel experts publish — in-depth articles and day-by-day itineraries for every city we cover. Monthly or annual, cancel anytime.',
};

export default function JoinPage() {
  return <PricingDisplay />;
}
