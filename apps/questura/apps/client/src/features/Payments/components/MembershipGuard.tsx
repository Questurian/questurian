import { isActiveMember } from '../lib/membership';
import type { MembershipGuardProps } from '../types';

export default function MembershipGuard({ user, children, fallback }: MembershipGuardProps) {
  const hasActiveMembership = user ? isActiveMember(user) : false;

  if (hasActiveMembership) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
          You&apos;re Already a Member!
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          You already have an active membership. Visit your account to manage your settings.
        </p>
        <a
          href="/account"
          className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
        >
          Go to Account
        </a>
      </div>
    </div>
  );
}