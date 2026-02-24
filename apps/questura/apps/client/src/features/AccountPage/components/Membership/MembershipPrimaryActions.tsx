import Link from 'next/link';

import type { MembershipPrimaryActionsProps } from '../../types/membership.types';

export function MembershipPrimaryActions({
  showUpgradeButton,
  showReactivateButton,
  isRenewing,
  onReactivate,
}: MembershipPrimaryActionsProps) {
  return (
    <div className="flex flex-col gap-2 ml-4">
      {showUpgradeButton && (
        <Link
          href="/purchase/monthly"
          className="
            inline-block bg-[#2C2C2C] hover:bg-[#1A1A1A]
            text-white py-2 px-5 rounded
            text-[0.82rem] font-medium transition-colors
            whitespace-nowrap
          "
        >
          Upgrade
        </Link>
      )}

      {showReactivateButton && (
        <button
          onClick={onReactivate}
          disabled={isRenewing}
          className="
            inline-block bg-[#2C2C2C] hover:bg-[#1A1A1A]
            text-white py-2 px-5 rounded
            text-[0.82rem] font-medium transition-colors
            whitespace-nowrap disabled:opacity-50
            disabled:cursor-not-allowed cursor-pointer
          "
        >
          {isRenewing ? 'Reactivating...' : 'Reactivate'}
        </button>
      )}
    </div>
  );
}
