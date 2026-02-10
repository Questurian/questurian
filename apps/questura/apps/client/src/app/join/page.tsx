import type { Metadata } from 'next';
import PricingDisplay from '@/features/Payments/components/PricingDisplay';

export const metadata: Metadata = {
  title: 'Join Questurian — Your Guide to Living in Latin America',
  description:
    'In-depth city guides, relocation playbooks, and a community of people already doing it. Starting at less than $1.55 a week.',
};

export default function JoinPage() {
  return <PricingDisplay />;
}
