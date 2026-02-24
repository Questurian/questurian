import type { MembershipBillingInfoProps } from '../../types/membership.types';

export function MembershipBillingInfo({ billingInfo }: MembershipBillingInfoProps) {
  return (
    <div className="bg-white border border-[#e5e2dc] rounded-sm p-4 mb-4">
      <h4 className="text-[0.84rem] font-medium text-[#1A1A1A] mb-2">Billing Information</h4>
      <div className="space-y-1.5 text-[0.82rem] text-[#6b6a68]">
        <div className="flex justify-between">
          <span>Billing Period:</span>
          <span className="font-medium text-[#1A1A1A]">{billingInfo.billingPeriod}</span>
        </div>
        <div className="flex justify-between">
          <span>Next Payment:</span>
          <span className="font-medium text-[#1A1A1A]">{billingInfo.nextBilling}</span>
        </div>
      </div>
    </div>
  );
}
