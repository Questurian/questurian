import type { MembershipAlertsProps } from '../../types/membership.types';

export function MembershipAlerts({
  isRenewing,
  successMessage,
  error,
  onDismissSuccess,
}: MembershipAlertsProps) {
  return (
    <>
      {isRenewing && (
        <div className="mb-4 p-3 480:p-4 bg-[#e3f2fd] border border-[#bbdefb] rounded-sm">
          <p className="text-[0.8rem] 480:text-[0.84rem] text-[#1565c0]">Reactivating your subscription...</p>
        </div>
      )}

      {successMessage && (
        <div className="mb-4 p-3 480:p-4 bg-[#e8f5e9] border border-[#c8e6c9] rounded-sm relative">
          <button
            onClick={onDismissSuccess}
            className="absolute top-2.5 right-2.5 text-[#2e7d32] hover:text-[#1b5e20]"
            aria-label="Dismiss success message"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <p className="text-[0.8rem] 480:text-[0.84rem] text-[#2e7d32] pr-6">{successMessage}</p>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 480:p-4 bg-[#fce4ec] border border-[#f8bbd0] rounded-sm">
          <p className="text-[0.8rem] 480:text-[0.84rem] text-[#c62828]">{error}</p>
        </div>
      )}
    </>
  );
}
