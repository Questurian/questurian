import PurchasePage from '@/features/Payments/pages/PurchasePage';

export default function PurchaseMonthly() {
  return (
    <PurchasePage 
      planName="Monthly Plan"
      amount={12.99}
      planDescription="Cancel anytime • All features included"
    />
  );
}