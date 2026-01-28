/**
 * Email input step for authentication flow
 * Shared component used by both Auth and LoginModal features
 */

import GoogleSignInButton from '../google/GoogleSignInButton';
import type { EmailStepProps } from '../../types';

export default function EmailStep({
  email,
  onChange,
  onSubmit,
  fieldError,
  loading,
  checkingAccount,
  canContinue,
  inModal = false,
  errorMessage
}: EmailStepProps) {
  return (
    <form className={inModal ? "space-y-4" : "mt-8 space-y-6"} onSubmit={onSubmit}>
      <div className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-black mb-1">
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
                ? 'border-red-300'
                : 'border-gray-300'
            } placeholder-gray-500 text-black bg-white focus:outline-none focus:ring-[#468BE6] focus:border-[#468BE6] focus:z-10 transition-colors`}
            placeholder="Email address"
            value={email}
            onChange={onChange}
            disabled={loading}
          />
          {fieldError && (
            <p className="mt-1 text-sm text-red-600">
              {fieldError}
            </p>
          )}
        </div>
      </div>

      <div>
        <button
          type="submit"
          disabled={loading || !canContinue}
          className={`group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors ${
            canContinue && !loading
              ? 'bg-[#468BE6] hover:bg-[#1A5799] focus:ring-[#468BE6] cursor-pointer'
              : 'bg-gray-300 cursor-not-allowed'
          }`}
        >
          {loading || checkingAccount ? (
            <div className="flex items-center gap-2">
              <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
              <span>Checking account...</span>
            </div>
          ) : (
            'Continue'
          )}
        </button>
      </div>

      {/* Google Sign-In */}
      <div className="mt-6">
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className={`px-2 ${inModal ? 'bg-white' : 'bg-gray-50'} text-black font-semibold`}>
              Or continue with
            </span>
          </div>
        </div>

        <div className="mt-6">
          <GoogleSignInButton className="w-full" />
        </div>

        {errorMessage && (
          <div className="mt-4 rounded-md bg-orange-50 border border-orange-200 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-orange-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-orange-800">
                  {errorMessage}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </form>
  );
}
