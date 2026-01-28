import { User } from '@/lib/user/types';
import { useRouter } from 'next/navigation';

interface PasswordSectionProps {
  user: User | null;
  passwordSuccess?: string | null;
  passwordError?: string | null;
  onClearPasswordMessages?: () => void;
}

export function PasswordSection({ user, passwordSuccess, passwordError, onClearPasswordMessages }: PasswordSectionProps) {
  const router = useRouter();
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Password
          </h3>

          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            {user?.authProvider === 'local' || user?.authProvider === 'dual'
              ? 'Password authentication is enabled and secure.'
              : 'No password set. You can add password authentication for additional security.'}
          </p>

          {passwordSuccess && (
            <div className="mb-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200 px-4 py-3 rounded-lg relative flex items-start justify-between">
              <span className="text-sm">{passwordSuccess}</span>
              {onClearPasswordMessages && (
                <button
                  onClick={onClearPasswordMessages}
                  className="text-green-800 dark:text-green-200 hover:text-green-900 dark:hover:text-green-100 ml-4"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          )}

          {passwordError && (
            <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 px-4 py-3 rounded-lg relative flex items-start justify-between">
              <span className="text-sm">{passwordError}</span>
              {onClearPasswordMessages && (
                <button
                  onClick={onClearPasswordMessages}
                  className="text-red-800 dark:text-red-200 hover:text-red-900 dark:hover:text-red-100 ml-4"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          )}
        </div>
        <button
          onClick={() => {
            if (user?.authProvider === 'local' || user?.authProvider === 'dual') {
              router.push('/account/change-password');
            } else {
              router.push('/account/add-password');
            }
          }}
          className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 underline ml-4 cursor-pointer"
        >
          {user?.authProvider === 'local' || user?.authProvider === 'dual' ? 'Change password' : 'Set password'}
        </button>
      </div>
    </div>
  );
}