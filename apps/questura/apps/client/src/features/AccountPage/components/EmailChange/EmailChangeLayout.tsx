import type { JSX } from 'react';
import { EMAIL_CHANGE_STEP_COPY } from '../../constants/email-change.constants';
import type { EmailChangeStep } from '../../types/email-change.types';

interface EmailChangeLayoutProps {
  step: EmailChangeStep;
  error: string | null;
  onBackToAccount: () => void;
  children: JSX.Element | null | Array<JSX.Element | null>;
}

export default function EmailChangeLayout({ step, error, onBackToAccount, children }: EmailChangeLayoutProps) {
  const stepCopy = EMAIL_CHANGE_STEP_COPY[step];

  return (
    <div className="min-h-screen">
      <div className="px-6 pt-8 pb-16 480:pt-10 768:pt-12">
        <div className="max-w-xl mx-auto">
          <div className="mb-8">
            <button
              onClick={onBackToAccount}
              className="
                text-[0.82rem] text-[#9a9894] hover:text-[#1A1A1A]
                flex items-center gap-1.5 mb-5 transition-colors
              "
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Account
            </button>
            <p className="text-[0.68rem] uppercase tracking-[0.18em] font-semibold text-[#9a9894] mb-2">
              {stepCopy.description}
            </p>
            <h1 className="font-display text-[1.35rem] text-[#1A1A1A] 480:text-[1.55rem] 768:text-[1.75rem]">
              {stepCopy.title}
            </h1>
          </div>

          <div className="bg-[#f7f6f2] border border-[#d7d4ce] rounded-sm p-6 480:p-8">
            {error && (
              <div className="mb-5 p-3 bg-[#fce4ec] border border-[#f8bbd0] rounded-sm">
                <p className="text-[0.84rem] text-[#c62828]">{error}</p>
              </div>
            )}

            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
