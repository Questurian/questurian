import type { FormEvent } from 'react';

interface EnterNewEmailFormProps {
  currentEmail: string;
  newEmail: string;
  isPending: boolean;
  onNewEmailChange: (value: string) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onBack: () => void;
}

export default function EnterNewEmailForm({
  currentEmail,
  newEmail,
  isPending,
  onNewEmailChange,
  onSubmit,
  onBack,
}: EnterNewEmailFormProps) {
  return (
    <form onSubmit={onSubmit}>
      <div className="space-y-4">
        <div>
          <label className="block text-[0.82rem] font-medium text-[#4f4e4b] mb-1.5">Current Email</label>
          <div className="text-[0.88rem] text-[#6b6a68] bg-white px-3.5 py-2.5 rounded-sm border border-[#e5e2dc]">
            {currentEmail}
          </div>
        </div>

        <div>
          <label className="block text-[0.82rem] font-medium text-[#4f4e4b] mb-1.5">New Email Address</label>
          <input
            type="email"
            value={newEmail}
            onChange={(e) => onNewEmailChange(e.target.value)}
            className="
              w-full px-3.5 py-2.5 border border-[#d7d4ce] rounded-sm
              text-[0.88rem] text-[#1A1A1A] placeholder-[#c4c2be]
              focus:outline-none focus:border-[#1A1A1A]
              bg-white transition-colors
            "
            placeholder="Enter new email address"
            required
            disabled={isPending}
            autoFocus
          />
        </div>

        <div className="bg-white border border-[#e5e2dc] rounded-sm p-3.5">
          <p className="text-[0.78rem] text-[#9a9894] leading-[1.65]">
            We&apos;ll send a verification code to your new email address. The code will expire in 15 minutes.
          </p>
        </div>
      </div>

      <div className="flex gap-3 mt-7">
        <button
          type="submit"
          disabled={isPending || !newEmail}
          className="
            flex-1 bg-[#2C2C2C] hover:bg-[#1A1A1A]
            text-white text-center py-3 rounded
            text-[0.88rem] font-medium transition-colors
            disabled:opacity-50 disabled:cursor-not-allowed
          "
        >
          {isPending ? 'Sending...' : 'Send Verification Code'}
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
