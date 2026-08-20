"use client";

import { useEffect, useState, type FormEvent } from 'react';
import { usePasswordResetRequest } from '@/features/Auth/hooks/usePasswordResetRequest';

interface PasswordResetModalProps {
  isOpen: boolean;
  onClose: () => void;
  email: string;
}

export default function PasswordResetModal({
  isOpen,
  onClose,
  email
}: PasswordResetModalProps) {
  const [sent, setSent] = useState(false);
  const resetRequest = usePasswordResetRequest();
  const { reset } = resetRequest;

  useEffect(() => {
    if (!isOpen) {
      setSent(false);
      reset();
    }
  }, [isOpen, reset]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await resetRequest.mutateAsync({ email });
    setSent(true);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-5">
      <button
        type="button"
        className="absolute inset-0 bg-[#1A1A1A]/60"
        onClick={onClose}
        aria-label="Close password reset"
      />

      <div
        className="bg-[#f7f6f2] border border-[#d7d4ce] rounded-sm max-w-md w-full p-6 480:p-8 relative"
        role="dialog"
      >
        <button
          type="button"
          className="absolute top-4 right-4 text-[#9a9894] hover:text-[#1A1A1A] transition-colors cursor-pointer"
          onClick={onClose}
        >
          <span className="sr-only">Close</span>
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h3 className="font-display text-[1.15rem] text-[#1A1A1A] mb-2 768:text-[1.25rem]">
          Reset Password
        </h3>
        <p className="text-[0.88rem] text-[#6b6a68] leading-[1.65] mb-6">
          {sent
            ? "Check your email for a password reset link."
            : "We'll email you a secure link to choose a new password."}
        </p>

        {sent ? (
          <button
            type="button"
            className="
              w-full bg-[#2C2C2C] hover:bg-[#1A1A1A]
              text-white text-center py-3 rounded
              text-[0.88rem] font-medium transition-colors
            "
            onClick={onClose}
          >
            Done
          </button>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <input
              type="email"
              value={email}
              readOnly
              className="
                w-full px-3.5 py-2.5 border border-[#e5e2dc] rounded-sm
                text-[0.88rem] text-[#1A1A1A] bg-white
              "
            />
            {resetRequest.error && (
              <p className="text-[0.84rem] text-[#c62828]">
                {resetRequest.error.message}
              </p>
            )}
            <button
              type="submit"
              disabled={resetRequest.isPending}
              className="
                w-full bg-[#2C2C2C] hover:bg-[#1A1A1A]
                text-white text-center py-3 rounded
                text-[0.88rem] font-medium transition-colors
                disabled:opacity-50 disabled:cursor-not-allowed
              "
            >
              {resetRequest.isPending ? 'Sending...' : 'Send reset link'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
