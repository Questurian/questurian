import type { FormEvent } from 'react';
import PasswordInput from '@/components/shared/ui/PasswordInput';

interface VerifyPasswordFormProps {
  password: string;
  isPending: boolean;
  onPasswordChange: (value: string) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}

export default function VerifyPasswordForm({
  password,
  isPending,
  onPasswordChange,
  onSubmit,
  onCancel,
}: VerifyPasswordFormProps) {
  return (
    <form onSubmit={onSubmit}>
      <div className="space-y-4">
        <p className="text-[0.88rem] text-[#6b6a68] leading-[1.65] mb-1">
          For security, please enter your current password to continue.
        </p>

        <PasswordInput
          label="Current Password"
          name="password"
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          placeholder="Enter your password"
          autoComplete="current-password"
          required
          disabled={isPending}
          autoFocus
        />
      </div>

      <div className="flex gap-3 mt-7">
        <button
          type="submit"
          disabled={isPending || !password}
          className="
            flex-1 bg-[#2C2C2C] hover:bg-[#1A1A1A]
            text-white text-center py-3 rounded
            text-[0.88rem] font-medium transition-colors
            disabled:opacity-50 disabled:cursor-not-allowed
          "
        >
          {isPending ? 'Verifying...' : 'Continue'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="
            flex-1 bg-white border border-[#d7d4ce]
            text-[#4f4e4b] text-center py-3 rounded
            text-[0.88rem] font-medium transition-colors
            hover:bg-[#f0efeb]
          "
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
