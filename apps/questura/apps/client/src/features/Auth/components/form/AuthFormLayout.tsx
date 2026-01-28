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
    : "min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 640:px-6 1024:px-8";

  const contentClasses = inModal
    ? "w-full space-y-4"
    : "max-w-md w-full space-y-8";

  return (
    <div className={containerClasses}>
      <div className={contentClasses}>
        {!inModal && (
          <div>
            <h2 className="mt-6 text-center text-3xl font-extrabold text-black">
              {title}
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600">
              {subtitle}
            </p>
          </div>
        )}

        {generalErrors.length > 0 && (
          <div className="rounded-md bg-red-50 p-4 border border-red-200">
            <div className="flex">
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">
                  {isSignUp ? 'Sign up failed' : 'Sign in failed'}
                </h3>
                <div className="mt-2 text-sm text-red-700">
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
