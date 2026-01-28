/**
 * Password input step for authentication flow
 * Shared component used by both Auth and LoginModal features
 */

import { useResetPasswordModalStore } from '../../stores/resetPasswordModalStore';
import GoogleSignInButton from '../google/GoogleSignInButton';
import PasswordStrengthIndicator from '../PasswordStrengthIndicator';
import { validatePasswordRequirements } from '../../lib/auth-utils';
import type { PasswordStepProps } from '../../types';

export default function PasswordStep({
  email,
  password,
  onChange,
  onSubmit,
  onBackToEmail,
  fieldError,
  loading,
  isSignUp,
  showPassword,
  onTogglePassword,
  userAccountStatus,
  inModal = false,
  errorMessage
}: PasswordStepProps) {
  const isPasswordOptional = userAccountStatus?.hasGoogleAuth && !userAccountStatus?.hasPassword && !password;
  const openResetPasswordModal = useResetPasswordModalStore(state => state.openModal);

  const handleForgotPassword = () => {
    openResetPasswordModal(email);
  };

  return (
    <form className={inModal ? "space-y-4" : "mt-8 space-y-6"} onSubmit={onSubmit}>
      <div className="space-y-4">
        {/* Email field (read-only with edit button) */}
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-black mb-1">
            Email
          </label>
          <div className="relative">
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="appearance-none rounded-lg relative block w-full px-3 py-3 pr-16 border border-gray-200 bg-gray-50 placeholder-gray-500 text-black focus:outline-none focus:ring-[#468BE6] focus:border-[#468BE6] focus:z-10"
              placeholder="Email address"
              value={email}
              disabled
              readOnly
            />
            <button
              type="button"
              onClick={onBackToEmail}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-400 hover:text-gray-500 cursor-pointer"
            >
              Edit
            </button>
          </div>
        </div>

        {/* Password field */}
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-black mb-1">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete={isSignUp ? "new-password" : "current-password"}
              required={!userAccountStatus?.hasGoogleAuth || userAccountStatus?.hasPassword}
              className={`appearance-none rounded-lg relative block w-full px-3 py-3 pr-16 border ${
                fieldError
                  ? 'border-red-300'
                  : 'border-gray-300'
              } placeholder-gray-500 text-black bg-white focus:outline-none focus:ring-[#468BE6] focus:border-[#468BE6] focus:z-10 transition-colors`}
              placeholder="Password"
              value={password}
              onChange={onChange}
              disabled={loading}
            />
            <button
              type="button"
              onClick={onTogglePassword}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-400 hover:text-gray-500 cursor-pointer"
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          {fieldError && (
            <p className="mt-1 text-sm text-red-600">
              {fieldError}
            </p>
          )}
          {isSignUp && (
            <PasswordStrengthIndicator
              requirements={validatePasswordRequirements(password)}
            />
          )}
          {!isSignUp && (
            <div className="mt-2 text-left">
              <button
                type="button"
                onClick={handleForgotPassword}
                className="text-sm text-gray-600 hover:text-[#468BE6] cursor-pointer underline transition-colors"
              >
                Forgot password?
              </button>
            </div>
          )}
        </div>
      </div>

      <div>
        <button
          type="submit"
          disabled={loading || isPasswordOptional}
          className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-[#468BE6] hover:bg-[#1A5799] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#468BE6] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
        >
          {loading ? (
            <div className="flex items-center">
              <div className="animate-spin -ml-1 mr-3 h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
              {isSignUp ? 'Creating account...' : 'Signing in...'}
            </div>
          ) : (
            isSignUp ? 'Create account' : 'Sign in'
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
            <span className={`px-2 ${inModal ? 'bg-white' : 'bg-gray-50'} text-black font-bold`}>
              Or continue with
            </span>
          </div>
        </div>

        <div className="mt-6">
          <GoogleSignInButton className="w-full" />
        </div>

        {errorMessage && (
          <div className="mt-4 rounded-md bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-orange-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-orange-800 dark:text-orange-200">
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
