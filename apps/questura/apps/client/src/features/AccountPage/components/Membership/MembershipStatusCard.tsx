import type { MembershipStatusCardProps } from '../../types/membership.types';

export function MembershipStatusCard({ isRenewing, membershipState }: MembershipStatusCardProps) {
  if (isRenewing) return null;

  return (
    <>
      <div className="mb-4">
        <span className={`inline-flex items-center px-3 py-1 rounded-sm text-[0.78rem] font-medium ${membershipState.badgeClass}`}>
          {membershipState.label}
        </span>
      </div>

      <p className="text-[0.84rem] text-[#6b6a68] leading-[1.65] mb-4">{membershipState.description}</p>
    </>
  );
}
