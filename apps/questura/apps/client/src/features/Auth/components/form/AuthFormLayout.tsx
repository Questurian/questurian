/**
 * Layout wrapper for authentication forms
 * Shared component used by both Auth and LoginModal features
 */

import type { AuthFormLayoutProps } from '../../types';

export default function AuthFormLayout({
  children,
  inModal = false,
  title,
  subtitle,
  generalErrors,
  isSignUp
}: AuthFormLayoutProps) {
  const containerClasses = inModal
    ? "w-full space-y-6"
    : "min-h-screen flex items-center justify-center px-5 py-12";

  const contentClasses = inModal
    ? "w-full space-y-4"
    : "max-w-xl w-full bg-[#f7f6f2] border border-[#d7d4ce] rounded-sm p-6 480:p-8 space-y-6";

  return (
    <div className={containerClasses}>
      <div className={contentClasses}>
        {!inModal && (
          <div>
            <h2 className="mt-6 text-center font-display text-[1.35rem] text-[#1A1A1A] 480:text-[1.55rem]">
              {title}
            </h2>
            <p className="mt-2 text-center text-[0.88rem] text-[#6b6a68] leading-[1.65]">
              {subtitle}
            </p>
          </div>
        )}

        {generalErrors.length > 0 && (
          <div className="rounded-sm bg-[#fce4ec] p-3.5 border border-[#f8bbd0]">
            <div className="flex">
              <div className="ml-3">
                <h3 className="text-[0.84rem] font-medium text-[#c62828]">
                  {isSignUp ? 'Sign up failed' : 'Sign in failed'}
                </h3>
                <div className="mt-2 text-[0.84rem] text-[#c62828]">
                  <ul className="list-disc pl-5 space-y-1">
                    {generalErrors.map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {children}
      </div>
    </div>
  );
}
