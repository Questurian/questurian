/**
 * Verification step for password reset flow
 * User enters verification code and new password
 */

import PasswordStrengthIndicator from '../PasswordStrengthIndicator';
import { validatePasswordRequirements } from '../../lib/auth-utils';
import type { ResetPasswordVerifyStepProps } from '../../types';

export default function ResetPasswordVerifyStep({
  email,
  code,
  newPassword,
  confirmPassword,
  onChange,
  onSubmit,
  onBackToEmail,
  fieldError,
  loading,
  showPassword,
  onTogglePassword,
  inModal = false,
  generalError,
  currentStep = 1,
  onRequestNewCode
}: ResetPasswordVerifyStepProps) {
  const isStep1 = currentStep === 1;
  const isStep2 = currentStep === 2;
  const isExpiredCodeError = generalError?.includes('invalid or has expired');

  return (
    <form className={inModal ? "space-y-4" : "mt-8 space-y-6"} onSubmit={onSubmit}>
      <div className="space-y-4">
        {/* Email field (read-only with edit button) - show on both steps */}
        {isStep2 && (
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Email
            </label>
            <div className="relative">
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="appearance-none rounded-lg relative block w-full px-3 py-3 pr-16 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 640:text-sm"
                placeholder="Email address"
                value={email}
                disabled
                readOnly
              />
              <button
                type="button"
                onClick={onBackToEmail}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 cursor-pointer"
              >
                Edit
              </button>
            </div>
          </div>
        )}

        {/* Verification code field - Step 1 only */}
        {isStep1 && (
          <div>
            <label htmlFor="code" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Verification code
            </label>
            <input
              id="code"
              name="code"
              type="text"
              inputMode="numeric"
              placeholder="000000"
              maxLength={6}
              required
              className={`appearance-none rounded-lg relative block w-full px-3 py-3 border ${
                fieldError?.includes('code')
                  ? 'border-red-300 dark:border-red-600'
                  : 'border-gray-300 dark:border-gray-600'
              } placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white bg-white dark:bg-gray-800 focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 640:text-sm tracking-widest text-center text-lg`}
              value={code}
              onChange={onChange}
              disabled={loading}
              autoFocus
            />
            {fieldError?.includes('code') && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                {fieldError}
              </p>
            )}
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Enter the 6-digit code sent to your email
            </p>
          </div>
        )}

        {/* New password field - Step 2 only */}
        {isStep2 && (
          <div>
            <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              New password
            </label>
            <div className="relative">
              <input
                id="newPassword"
                name="newPassword"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                className={`appearance-none rounded-lg relative block w-full px-3 py-3 pr-16 border ${
                  fieldError?.includes('newPassword')
                    ? 'border-red-300 dark:border-red-600'
                    : 'border-gray-300 dark:border-gray-600'
                } placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white bg-white dark:bg-gray-800 focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 640:text-sm`}
                placeholder="New password"
                value={newPassword}
                onChange={onChange}
                disabled={loading}
                autoFocus
              />
              <button
                type="button"
                onClick={onTogglePassword}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-600 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 cursor-pointer"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            {fieldError?.includes('newPassword') && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                {fieldError}
              </p>
            )}
            {newPassword && (
              <PasswordStrengthIndicator
                requirements={validatePasswordRequirements(newPassword)}
              />
            )}
          </div>
        )}

        {/* Confirm password field - Step 2 only */}
        {isStep2 && (
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Confirm password
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              className={`appearance-none rounded-lg relative block w-full px-3 py-3 border ${
                fieldError?.includes('confirmPassword')
                  ? 'border-red-300 dark:border-red-600'
                  : 'border-gray-300 dark:border-gray-600'
              } placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white bg-white dark:bg-gray-800 focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 640:text-sm`}
              placeholder="Confirm password"
              value={confirmPassword}
              onChange={onChange}
              disabled={loading}
            />
            {fieldError?.includes('confirmPassword') && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                {fieldError}
              </p>
            )}
          </div>
        )}
      </div>

      <div>
        <button
          type="submit"
          disabled={loading}
          className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
        >
          {loading ? (
            <div className="flex items-center">
              <div className="animate-spin -ml-1 mr-3 h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
              {isStep1 ? 'Verifying code...' : 'Resetting password...'}
            </div>
          ) : (
            isStep1 ? 'Next' : 'Reset password'
          )}
        </button>
      </div>

      {generalError && (
        <div className="rounded-md bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-orange-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3 flex-1">
              <p className="text-sm text-orange-800 dark:text-orange-200 mb-2">
                {generalError}
              </p>
              {isStep1 && isExpiredCodeError && onRequestNewCode && (
                <button
                  type="button"
                  onClick={onRequestNewCode}
                  disabled={loading}
                  className="text-sm font-medium text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Requesting new code...' : 'Request New Code'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
