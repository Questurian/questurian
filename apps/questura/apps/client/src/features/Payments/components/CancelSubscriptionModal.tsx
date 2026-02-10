import type { CancelSubscriptionModalProps } from '../types';

export function CancelSubscriptionModal({
  show,
  onConfirm,
  onClose,
  isLoading = false,
  membershipExpiration
}: CancelSubscriptionModalProps) {
  if (!show) return null;

  const formatExpirationDate = (date: string | Date | null | undefined) => {
    if (!date) return 'the end of your current billing period';
    try {
      return new Date(date).toLocaleDateString();
    } catch {
      return 'the end of your current billing period';
    }
  };

  return (
    <div className="fixed inset-0 bg-[#1A1A1A]/60 flex items-center justify-center p-5 z-50">
      <div className="bg-[#f7f6f2] border border-[#d7d4ce] rounded-sm max-w-md w-full p-6 480:p-8">
        <h3 className="font-display text-[1.15rem] text-[#1A1A1A] mb-4 768:text-[1.25rem]">
          Cancel Subscription
        </h3>

        <div className="mb-6">
          <p className="text-[0.88rem] text-[#6b6a68] leading-[1.65] mb-3">
            Are you sure you want to cancel your subscription?
          </p>
          <p className="text-[0.88rem] text-[#6b6a68] leading-[1.65]">
            Your premium access will continue until {formatExpirationDate(membershipExpiration)},
            and then your account will revert to the free plan.
          </p>
        </div>

        <div className="bg-[#fff3e0] border border-[#ffe0b2] rounded-sm p-3.5 mb-6">
          <p className="text-[0.84rem] text-[#e65100] leading-[1.55]">
            <strong>Note:</strong> This action cannot be undone. You&apos;ll need to subscribe again to regain premium access.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="
              flex-1 bg-[#c62828] hover:bg-[#b71c1c]
              text-white text-center py-3 rounded
              text-[0.88rem] font-medium transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer
            "
          >
            {isLoading ? 'Cancelling...' : 'Yes, Cancel Subscription'}
          </button>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="
              flex-1 bg-white border border-[#d7d4ce]
              text-[#4f4e4b] text-center py-3 rounded
              text-[0.88rem] font-medium transition-colors
              hover:bg-[#f0efeb] disabled:opacity-50
              disabled:cursor-not-allowed cursor-pointer
            "
          >
            Keep Subscription
          </button>
        </div>
      </div>
    </div>
  );
}
