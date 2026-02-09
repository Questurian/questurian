import PurchasePage from '@/features/Payments/pages/PurchasePage';

export default function PurchaseMonthly() {
  return (
    <PurchasePage 
      planName="Monthly Plan" 
      amount={10}
      planDescription="Cancel anytime • All premium features"
    />
  );
}