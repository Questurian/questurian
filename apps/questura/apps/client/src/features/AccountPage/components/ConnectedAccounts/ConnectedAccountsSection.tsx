import { User } from '@/lib/user/types';

interface ConnectedAccountsSectionProps {
  user: User | null;
  onLinkGoogle: () => void;
  onUnlinkGoogle: () => void;
  success?: string | null;
  error?: string | null;
  onClearMessages?: () => void;
}

export function ConnectedAccountsSection({ user, onLinkGoogle, onUnlinkGoogle, success, error, onClearMessages }: ConnectedAccountsSectionProps) {
  const hasGoogleAuth = user?.authProvider === 'google' || user?.authProvider === 'dual';

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Connected accounts
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          You connected these accounts when you signed in.
        </p>

        {hasGoogleAuth ? (
          <>
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg mb-4">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-sm">
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-white">Google</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">{user?.email}</div>
                </div>
              </div>
              <button
                onClick={onUnlinkGoogle}
                className="text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 underline cursor-pointer"
              >
                Disconnect
              </button>
            </div>

            {success && (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200 px-4 py-3 rounded-lg relative flex items-start justify-between">
                <span className="text-sm">{success}</span>
                {onClearMessages && (
                  <button
                    onClick={onClearMessages}
                    className="text-green-800 dark:text-green-200 hover:text-green-900 dark:hover:text-green-100 ml-4"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            )}

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 px-4 py-3 rounded-lg relative flex items-start justify-between">
                <span className="text-sm">{error}</span>
                {onClearMessages && (
                  <button
                    onClick={onClearMessages}
                    className="text-red-800 dark:text-red-200 hover:text-red-900 dark:hover:text-red-100 ml-4"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-8">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">No connected accounts</p>
            <button 
              onClick={onLinkGoogle}
              className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 cursor-pointer"
            >
              Connect Google Account
            </button>
          </div>
        )}
      </div>
    </div>
  );
}