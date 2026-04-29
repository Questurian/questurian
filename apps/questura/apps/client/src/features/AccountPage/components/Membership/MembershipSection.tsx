import { CancelSubscriptionModal } from '../../../Payments/components/CancelSubscriptionModal';

import { useMembershipSection } from '../../hooks/useMembershipSection';
import type { MembershipSectionProps } from '../../types/membership.types';
import { MembershipActionLinks } from './MembershipActionLinks';
import { MembershipAlerts } from './MembershipAlerts';
import { MembershipBillingInfo } from './MembershipBillingInfo';
import { MembershipDebugInfo } from './MembershipDebugInfo';
import { MembershipPrimaryActions } from './MembershipPrimaryActions';
import { MembershipStatusCard } from './MembershipStatusCard';

export function MembershipSection({ user }: MembershipSectionProps) {
  const vm = useMembershipSection(user);

  return (
    <div className="bg-[#f7f6f2] border border-[#d7d4ce] rounded-sm p-4 480:p-6 768:p-8">
      <div className="flex flex-col 480:flex-row 480:justify-between 480:items-start">
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-[1rem] 480:text-[1.1rem] text-[#1A1A1A] mb-1.5 768:text-[1.2rem]">Membership</h3>

          <MembershipAlerts
            isRenewing={vm.isRenewing}
            successMessage={vm.successMessage}
            error={vm.error}
            onDismissSuccess={vm.clearSuccess}
          />

          <MembershipStatusCard
            isRenewing={vm.isRenewing}
            membershipState={vm.membershipState}
          />

          {vm.billingInfo && !vm.isRenewing && (
            <>
              <MembershipBillingInfo billingInfo={vm.billingInfo} />
              <MembershipActionLinks
                canUpdatePayment={vm.canUpdatePayment}
                canCancel={vm.membershipState.showCancelButton}
                isCancelling={vm.isCancelling}
                onUpdatePayment={vm.handleUpdatePaymentMethod}
                onOpenCancelModal={vm.openCancelModal}
              />
            </>
          )}

          <MembershipDebugInfo user={user} />
        </div>

        <MembershipPrimaryActions
          showUpgradeButton={vm.membershipState.showUpgradeButton}
          showReactivateButton={vm.membershipState.showReactivateButton}
          isRenewing={vm.isRenewing}
          onReactivate={vm.handleRenewSubscription}
        />
      </div>

      <CancelSubscriptionModal
        show={vm.showCancellationModal}
        onConfirm={vm.handleCancelSubscription}
        onClose={vm.handleCloseModal}
        isLoading={vm.isCancelling}
        membershipExpiration={user?.membershipExpiration}
      />
    </div>
  );
}
