import type { User } from '@/lib/user/types';

interface MembershipDebugInfoProps {
  user: User | null;
}

export function MembershipDebugInfo({ user }: MembershipDebugInfoProps) {
  const shouldShow = process.env.NODE_ENV === 'development' && (user?.stripeCustomerId || user?.stripeSubscriptionId);

  if (!shouldShow) return null;

  return (
    <details className="mb-4">
      <summary className="text-[0.72rem] text-[#c4c2be] cursor-pointer hover:text-[#9a9894]">
        Debug Info
      </summary>
      <div className="mt-2 text-[0.72rem] text-[#c4c2be] space-y-1 pl-4">
        {user?.stripeCustomerId && <div>Customer ID: {user.stripeCustomerId}</div>}
        {user?.stripeSubscriptionId && <div>Subscription ID: {user.stripeSubscriptionId}</div>}
      </div>
    </details>
  );
}
