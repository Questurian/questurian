import type { MembershipActionLinksProps } from '../../types/membership.types';

export function MembershipActionLinks({
  canUpdatePayment,
  canCancel,
  isCancelling,
  onUpdatePayment,
  onOpenCancelModal,
}: MembershipActionLinksProps) {
  return (
    <div className="flex flex-wrap gap-3 480:gap-4 mb-4">
      {canUpdatePayment && (
        <button
          onClick={onUpdatePayment}
          className="
            text-[0.82rem] text-[#6b6a68] hover:text-[#1A1A1A]
            underline underline-offset-2 cursor-pointer transition-colors
          "
        >
          Update Payment Method
        </button>
      )}

      {canCancel && (
        <button
          onClick={onOpenCancelModal}
          disabled={isCancelling}
          className="
            text-[0.82rem] text-[#6b6a68] hover:text-[#1A1A1A]
            underline underline-offset-2 cursor-pointer transition-colors
            disabled:opacity-50 disabled:cursor-not-allowed
          "
        >
          {isCancelling ? 'Cancelling...' : 'Cancel Subscription'}
        </button>
      )}
    </div>
  );
}
