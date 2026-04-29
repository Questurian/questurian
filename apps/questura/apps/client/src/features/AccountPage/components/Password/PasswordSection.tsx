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
    <div className="bg-[#f7f6f2] border border-[#d7d4ce] rounded-sm p-4 480:p-6 768:p-8">
      <div className="flex flex-col 480:flex-row 480:justify-between 480:items-start">
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-[1rem] 480:text-[1.1rem] text-[#1A1A1A] mb-1.5 768:text-[1.2rem]">
            Password
          </h3>

          <p className="text-[0.8rem] 480:text-[0.84rem] text-[#6b6a68] leading-[1.65] mb-3 480:mb-4">
            {user?.authProvider === 'local' || user?.authProvider === 'dual'
              ? 'Password authentication is enabled and secure.'
              : 'No password set. You can add password authentication for additional security.'}
          </p>

          {passwordSuccess && (
            <div className="mb-4 bg-[#e8f5e9] border border-[#c8e6c9] text-[#2e7d32] px-3 480:px-4 py-2.5 480:py-3 rounded-sm relative flex items-start justify-between">
              <span className="text-[0.8rem] 480:text-[0.84rem] leading-[1.5]">{passwordSuccess}</span>
              {onClearPasswordMessages && (
                <button
                  onClick={onClearPasswordMessages}
                  className="text-[#2e7d32] hover:text-[#1b5e20] ml-4 flex-shrink-0"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          )}

          {passwordError && (
            <div className="mb-4 bg-[#fce4ec] border border-[#f8bbd0] text-[#c62828] px-3 480:px-4 py-2.5 480:py-3 rounded-sm relative flex items-start justify-between">
              <span className="text-[0.8rem] 480:text-[0.84rem] leading-[1.5]">{passwordError}</span>
              {onClearPasswordMessages && (
                <button
                  onClick={onClearPasswordMessages}
                  className="text-[#c62828] hover:text-[#b71c1c] ml-4 flex-shrink-0"
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
          className="
            text-[0.82rem] text-[#6b6a68] hover:text-[#1A1A1A]
            underline underline-offset-2 480:ml-4 cursor-pointer
            transition-colors whitespace-nowrap mt-3 480:mt-0 self-start
          "
        >
          {user?.authProvider === 'local' || user?.authProvider === 'dual' ? 'Change password' : 'Set password'}
        </button>
      </div>
    </div>
  );
}
