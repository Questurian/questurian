import type { FormEvent } from 'react';

interface VerifyNewEmailFormProps {
  newEmail: string;
  verificationCode: string;
  willUnlinkGoogle: boolean;
  isPending: boolean;
  onVerificationCodeChange: (value: string) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onBack: () => void;
}

export default function VerifyNewEmailForm({
  newEmail,
  verificationCode,
  willUnlinkGoogle,
  isPending,
  onVerificationCodeChange,
  onSubmit,
  onBack,
}: VerifyNewEmailFormProps) {
  return (
    <form onSubmit={onSubmit}>
      <div className="space-y-4">
        <p className="text-[0.88rem] text-[#6b6a68] leading-[1.65] mb-1">
          We&apos;ve sent a verification code to <strong className="text-[#1A1A1A]">{newEmail}</strong>. Please
          enter it below to confirm your email change.
        </p>

        {willUnlinkGoogle && (
          <div className="p-3.5 bg-[#fff3e0] border border-[#ffe0b2] rounded-sm">
            <div className="flex items-start">
              <svg className="h-4.5 w-4.5 text-[#e65100] mt-0.5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              <p className="text-[0.84rem] text-[#e65100] leading-[1.55]">
                <strong>Warning:</strong> Changing your email will unlink your Google account. You&apos;ll only be
                able to log in with your password after this change.
              </p>
            </div>
          </div>
        )}

        <div>
          <label className="block text-[0.82rem] font-medium text-[#4f4e4b] mb-1.5">Verification Code</label>
          <input
            type="text"
            value={verificationCode}
            onChange={(e) => onVerificationCodeChange(e.target.value)}
            className="
              w-full px-3.5 py-2.5 border border-[#d7d4ce] rounded-sm
              text-[0.88rem] text-[#1A1A1A] placeholder-[#c4c2be]
              focus:outline-none focus:border-[#1A1A1A]
              bg-white transition-colors
            "
            placeholder="Enter 6-digit code"
            maxLength={6}
            required
            disabled={isPending}
            autoFocus
          />
        </div>

        <div className="bg-white border border-[#e5e2dc] rounded-sm p-3.5">
          <p className="text-[0.78rem] text-[#9a9894] leading-[1.65]">
            Code expires in 15 minutes. Didn&apos;t receive it? Go back and request a new code.
          </p>
        </div>
      </div>

      <div className="flex gap-3 mt-7">
        <button
          type="submit"
          disabled={isPending || verificationCode.length !== 6}
          className="
            flex-1 bg-[#2C2C2C] hover:bg-[#1A1A1A]
            text-white text-center py-3 rounded
            text-[0.88rem] font-medium transition-colors
            disabled:opacity-50 disabled:cursor-not-allowed
          "
        >
          {isPending ? 'Verifying...' : 'Verify & Change Email'}
        </button>
        <button
          type="button"
          onClick={onBack}
          disabled={isPending}
          className="
            flex-1 bg-white border border-[#d7d4ce]
            text-[#4f4e4b] text-center py-3 rounded
            text-[0.88rem] font-medium transition-colors
            hover:bg-[#f0efeb]
          "
        >
          Back
        </button>
      </div>
    </form>
  );
}
