import type { Metadata } from 'next';
import PricingDisplay from '@/features/Payments/components/PricingDisplay';

export const metadata: Metadata = {
  title: 'Join Questurian — Every Article and Itinerary, One Membership',
  description:
    'One membership unlocks everything our travel experts publish — in-depth articles and day-by-day itineraries for every city we cover. From less than $1.55 a week.',
};

export default function JoinPage() {
  return <PricingDisplay />;
}
