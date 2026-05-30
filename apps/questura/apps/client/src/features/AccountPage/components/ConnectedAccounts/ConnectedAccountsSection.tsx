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
  const canUnlinkGoogle = Boolean(user?.hasLocalPassword);

  return (
    <div className="bg-[#f7f6f2] border border-[#d7d4ce] rounded-sm p-4 480:p-6 768:p-8">
      <div>
        <h3 className="font-display text-[1rem] 480:text-[1.1rem] text-[#1A1A1A] mb-1.5 768:text-[1.2rem]">
          Connected accounts
        </h3>
        <p className="text-[0.8rem] 480:text-[0.84rem] text-[#6b6a68] leading-[1.65] mb-4 480:mb-5">
          You connected these accounts when you signed in.
        </p>

        {hasGoogleAuth ? (
          <>
            <div className="flex flex-col 480:flex-row 480:items-center 480:justify-between p-3 480:p-4 bg-white border border-[#e5e2dc] rounded-sm mb-4">
              <div className="flex items-center space-x-3 min-w-0">
                <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center border border-[#e5e2dc] flex-shrink-0">
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                </div>
                <div className="min-w-0">
                  <div className="text-[0.84rem] 480:text-[0.88rem] font-medium text-[#1A1A1A]">Google</div>
                  <div className="text-[0.78rem] 480:text-[0.82rem] text-[#6b6a68] truncate">{user?.email}</div>
                </div>
              </div>
              <button
                onClick={onUnlinkGoogle}
                disabled={!canUnlinkGoogle}
                className="
                  text-[0.82rem] text-[#c62828] hover:text-[#b71c1c]
                  underline underline-offset-2 cursor-pointer
                  transition-colors 480:ml-4 flex-shrink-0
                  mt-2 480:mt-0 self-start 480:self-auto
                  disabled:text-[#c4c2be] disabled:cursor-not-allowed
                "
              >
                Disconnect
              </button>
            </div>
            {!canUnlinkGoogle && (
              <p className="mb-4 text-[0.78rem] text-[#C65D3B]">
                Add a password before disconnecting Google.
              </p>
            )}

            {success && (
              <div className="bg-[#e8f5e9] border border-[#c8e6c9] text-[#2e7d32] px-3 480:px-4 py-2.5 480:py-3 rounded-sm relative flex items-start justify-between">
                <span className="text-[0.8rem] 480:text-[0.84rem] leading-[1.5]">{success}</span>
                {onClearMessages && (
                  <button
                    onClick={onClearMessages}
                    className="text-[#2e7d32] hover:text-[#1b5e20] ml-4 flex-shrink-0"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            )}

            {error && (
              <div className="bg-[#fce4ec] border border-[#f8bbd0] text-[#c62828] px-3 480:px-4 py-2.5 480:py-3 rounded-sm relative flex items-start justify-between">
                <span className="text-[0.8rem] 480:text-[0.84rem] leading-[1.5]">{error}</span>
                {onClearMessages && (
                  <button
                    onClick={onClearMessages}
                    className="text-[#c62828] hover:text-[#b71c1c] ml-4 flex-shrink-0"
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
          <div className="py-4 480:py-6">
            <p className="text-[0.82rem] 480:text-[0.84rem] text-[#9a9894] mb-3 480:mb-4">No connected accounts</p>
            <button
              onClick={onLinkGoogle}
              className="
                w-full 480:w-auto inline-flex items-center justify-center px-5 py-2.5
                border border-[#d7d4ce] text-[0.84rem] font-medium
                rounded-sm text-[#1A1A1A] bg-white
                hover:bg-[#f0efeb] cursor-pointer transition-colors
              "
            >
              Connect Google Account
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
