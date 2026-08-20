'use client';

import Link from 'next/link';
import { isActiveMember } from '../lib/membership';
import { useDevStore } from '@/lib/stores/devStore';
import type { MembershipGuardProps } from '../types';

/**
 * Hides purchase UI from active members.
 * Active membership → fallback, or the "already a member" screen.
 * Otherwise → children.
 */
export default function MembershipGuard({ user, children, fallback }: MembershipGuardProps) {
  useDevStore((s) => s.membershipOverride);
  const hasActiveMembership = user ? isActiveMember(user) : false;

  if (!hasActiveMembership) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  return (
    <div className="min-h-screen">
      <div className="px-6 pt-8 pb-16 480:pt-10 768:pt-12">
        <div className="max-w-xl mx-auto">
          <div className="bg-[#f7f6f2] border border-[#d7d4ce] rounded-sm p-6 480:p-8 text-center">
            <h1 className="font-display text-[1.35rem] text-[#1A1A1A] mb-2 480:text-[1.55rem]">
              You&apos;re Already a Member!
            </h1>
            <p className="text-[0.88rem] text-[#6b6a68] leading-[1.65] mb-6">
              You already have an active membership. Visit your account to manage your settings.
            </p>
            <Link
              href="/account"
              className="
                inline-block w-full bg-[#2C2C2C] hover:bg-[#1A1A1A]
                text-white text-center py-3.5 rounded
                text-[0.88rem] font-medium transition-colors
              "
            >
              Go to Account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
