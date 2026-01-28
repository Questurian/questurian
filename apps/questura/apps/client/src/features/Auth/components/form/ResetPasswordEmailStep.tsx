/**
 * Email input step for password reset flow
 * User enters email to request a password reset code
 */

import type { ResetPasswordEmailStepProps } from '../../types';

export default function ResetPasswordEmailStep({
  email,
  onChange,
  onSubmit,
  fieldError,
  loading,
  inModal = false,
  generalError
}: ResetPasswordEmailStepProps) {
  return (
    <form className={inModal ? "space-y-4" : "mt-8 space-y-6"} onSubmit={onSubmit}>
      <div className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className={`appearance-none rounded-lg relative block w-full px-3 py-3 border ${
              fieldError
                ? 'border-red-300 dark:border-red-600'
                : 'border-gray-300 dark:border-gray-600'
            } placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white bg-white dark:bg-gray-800 focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 640:text-sm`}
            placeholder="Email address"
            value={email}
            onChange={onChange}
            disabled={loading}
            autoFocus
          />
          {fieldError && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">
              {fieldError}
            </p>
          )}
        </div>
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
              Sending reset code...
            </div>
          ) : (
            'Send reset code'
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
            <div className="ml-3">
              <p className="text-sm text-orange-800 dark:text-orange-200">
                {generalError}
              </p>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
