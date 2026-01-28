import { User } from '@/lib/user/types';
import { useRouter } from 'next/navigation';

interface EmailSectionProps {
  user: User | null;
}

export function EmailSection({ user }: EmailSectionProps) {
  const router = useRouter();
  const hasPassword = user?.hasLocalPassword || user?.authProvider === 'local' || user?.authProvider === 'dual';

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Email
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Use this email to sign in. This is also where we&apos;ll send email communication and newsletters.
          </p>
          <div className="text-sm text-gray-900 dark:text-white font-medium mb-2">
            {user?.email}
          </div>
          {!hasPassword && (
            <p className="text-xs text-yellow-600 dark:text-yellow-400">
              You must add a password to your account before changing your email.
            </p>
          )}
        </div>
        {hasPassword ? (
          <button
            onClick={() => router.push('/account/change-email')}
            className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 underline ml-4 cursor-pointer"
          >
            Edit
          </button>
        ) : (
          <span className="text-sm text-gray-400 dark:text-gray-500 ml-4 cursor-not-allowed">
            Edit
          </span>
        )}
      </div>
    </div>
  );
}