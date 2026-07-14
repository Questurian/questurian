import PurchasePage from '@/features/Payments/pages/PurchasePage';

export default function PurchaseYearly() {
  return (
    <PurchasePage
      planName="Annual Plan"
      amount={79.99}
      planDescription="Billed once a year • All features included"
    />
  );
}
