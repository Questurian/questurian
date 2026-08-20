'use client';

import { useState, useEffect } from 'react';
import { User } from '@/lib/user/types';
import { useRouter } from 'next/navigation';
import { useAddPasswordMutation } from '@/features/AccountPage/hooks/useAccountMutations';
import PasswordStrengthIndicator from '@/features/Auth/components/PasswordStrengthIndicator';
import { validatePasswordRequirements, isPasswordValid } from '@/features/Auth/lib/auth-utils';
import { isServiceUnavailableError } from '@/lib/api';
import { accountActionLinkClassName } from '../account.styles';

function AccountPasswordInput({
  label,
  name,
  value,
  onChange,
  placeholder,
  disabled,
  autoFocus,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label htmlFor={name} className="block text-[0.8rem] text-[#6b6a68] mb-1.5">
        {label}
      </label>
      <div className="relative">
        <input
          id={name}
          name={name}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          autoComplete="new-password"
          required
          className="
            w-full px-3 py-2.5 pr-14 rounded-sm
            bg-white border border-[#d7d4ce]
            text-[0.84rem] text-[#1A1A1A]
            placeholder-[#9a9894]
            focus:outline-none focus:border-[#1A1A1A]
            disabled:opacity-50
          "
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setShow((s) => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[0.78rem] text-[#6b6a68] hover:text-[#1A1A1A] transition-colors"
        >
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
    </div>
  );
}

interface PasswordSectionProps {
  user: User | null;
  passwordSuccess?: string | null;
  passwordError?: string | null;
  onClearPasswordMessages?: () => void;
}

export function PasswordSection({ user, passwordSuccess, passwordError, onClearPasswordMessages }: PasswordSectionProps) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [passwordRequirements, setPasswordRequirements] = useState(validatePasswordRequirements(''));

  const addPasswordMutation = useAddPasswordMutation();

  useEffect(() => {
    setPasswordRequirements(validatePasswordRequirements(password));
  }, [password]);

  const resetForm = () => {
    setPassword('');
    setConfirmPassword('');
    setFormError(null);
    setPasswordRequirements(validatePasswordRequirements(''));
    setShowForm(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (password !== confirmPassword) {
      setFormError('Passwords do not match');
      return;
    }
    if (!passwordRequirements.hasMinLength) {
      setFormError('Password must be at least 8 characters');
      return;
    }
    if (!passwordRequirements.hasNumber) {
      setFormError('Password must contain at least one number');
      return;
    }
    if (!passwordRequirements.hasUppercase) {
      setFormError('Password must contain at least one uppercase letter');
      return;
    }
    if (!passwordRequirements.hasSymbol) {
      setFormError('Password must contain at least one symbol (!@#$%^&* etc.)');
      return;
    }

    addPasswordMutation.mutate(
      { password, confirmPassword },
      {
        onSuccess: () => {
          resetForm();
          setFormSuccess('Password added successfully! You can now sign in with email and password.');
        },
        onError: (err) => {
          if (isServiceUnavailableError(err)) {
            setFormError('Service is unavailable. Please try again later.');
          } else if (err instanceof Error) {
            setFormError(err.message);
          } else {
            setFormError('Failed to add password. Please try again.');
          }
        },
      }
    );
  };

  const isOAuthOnly = user?.authProvider !== 'local' && user?.authProvider !== 'dual';

  return (
    <div className="mt-5 pt-5 border-t border-[#d7d4ce] 480:mt-6 480:pt-6 768:mt-8 768:pt-8">
      <div className="flex flex-col 480:flex-row 480:justify-between 480:items-start">
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-[1rem] 480:text-[1.1rem] text-[#1A1A1A] mb-1.5 768:text-[1.2rem]">
            Password
          </h3>

          <p className="text-[0.8rem] 480:text-[0.84rem] text-[#6b6a68] leading-[1.65] mb-3 480:mb-4">
            {!isOAuthOnly
              ? 'Password authentication is enabled and secure.'
              : 'No password set. You can add password authentication for additional security.'}
          </p>

          {/* Success/error from parent (e.g. change-password redirect) */}
          {passwordSuccess && (
            <div className="mb-4 bg-[#e8f5e9] border border-[#c8e6c9] text-[#2e7d32] px-3 480:px-4 py-2.5 480:py-3 rounded-sm relative flex items-start justify-between">
              <span className="text-[0.8rem] 480:text-[0.84rem] leading-[1.5]">{passwordSuccess}</span>
              {onClearPasswordMessages && (
                <button onClick={onClearPasswordMessages} className="text-[#2e7d32] hover:text-[#1b5e20] ml-4 flex-shrink-0">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          )}

          {passwordError && (
            <div className="mb-4 bg-[#fce4ec] border border-[#f8bbd0] text-[#c62828] px-3 480:px-4 py-2.5 480:py-3 rounded-sm relative flex items-start justify-between">
              <span className="text-[0.8rem] 480:text-[0.84rem] leading-[1.5]">{passwordError}</span>
              {onClearPasswordMessages && (
                <button onClick={onClearPasswordMessages} className="text-[#c62828] hover:text-[#b71c1c] ml-4 flex-shrink-0">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          )}

          {/* Inline success from add-password form */}
          {formSuccess && (
            <div className="mb-4 bg-[#e8f5e9] border border-[#c8e6c9] text-[#2e7d32] px-3 480:px-4 py-2.5 480:py-3 rounded-sm relative flex items-start justify-between">
              <span className="text-[0.8rem] 480:text-[0.84rem] leading-[1.5]">{formSuccess}</span>
              <button onClick={() => setFormSuccess(null)} className="text-[#2e7d32] hover:text-[#1b5e20] ml-4 flex-shrink-0">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Action button — only shown when form is not open */}
        {!showForm && (
          <button
            onClick={() => {
              if (!isOAuthOnly) {
                router.push('/account/change-password');
              } else {
                setShowForm(true);
              }
            }}
            className={`${accountActionLinkClassName} 480:ml-4 whitespace-nowrap mt-3 480:mt-0 self-start`}
          >
            {!isOAuthOnly ? 'Change password' : 'Set password'}
          </button>
        )}
      </div>

      {/* Inline add-password form for OAuth-only accounts */}
      {showForm && (
        <form onSubmit={handleSubmit} className="mt-4 pt-4 border-t border-[#d7d4ce]">
          {formError && (
            <div className="mb-4 p-3 bg-[#fce4ec] border border-[#f8bbd0] rounded-sm">
              <p className="text-[0.84rem] text-[#c62828]">{formError}</p>
            </div>
          )}

          <div className="space-y-4">
            <AccountPasswordInput
              label="Password"
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter new password"
              disabled={addPasswordMutation.isPending}
              autoFocus
            />

            {password && <PasswordStrengthIndicator requirements={passwordRequirements} />}

            <AccountPasswordInput
              label="Confirm Password"
              name="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm password"
              disabled={addPasswordMutation.isPending}
            />

            {confirmPassword && password && (
              <div className="mt-1">
                {password === confirmPassword ? (
                  <div className="flex items-center gap-2">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center bg-[#e8f5e9]">
                      <svg className="w-3 h-3 text-[#2e7d32]" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <span className="text-[0.82rem] text-[#2e7d32] font-medium">Passwords match</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center bg-[#fce4ec]">
                      <svg className="w-3 h-3 text-[#c62828]" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <span className="text-[0.82rem] text-[#c62828] font-medium">Passwords do not match</span>
                  </div>
                )}
              </div>
            )}

            <div className="bg-white border border-[#e5e2dc] rounded-sm p-3.5">
              <p className="text-[0.78rem] text-[#9a9894] leading-[1.65]">
                <strong className="text-[#6b6a68]">Password requirements:</strong>
              </p>
              <ul className="text-[0.78rem] text-[#9a9894] mt-1 list-disc list-inside leading-[1.75]">
                <li>At least 8 characters long</li>
                <li>At least one number</li>
                <li>At least one uppercase letter</li>
                <li>At least one symbol (!@#$%^&* etc.)</li>
              </ul>
              <p className="text-[0.78rem] text-[#9a9894] mt-2">
                You can sign in with either Google or your email and password.
              </p>
            </div>
          </div>

          <div className="flex gap-3 mt-5">
            <button
              type="submit"
              disabled={
                addPasswordMutation.isPending ||
                !password ||
                !confirmPassword ||
                password !== confirmPassword ||
                !isPasswordValid(password)
              }
              className="
                flex-1 bg-[#2C2C2C] hover:bg-[#1A1A1A]
                text-white text-center py-3 rounded
                text-[0.88rem] font-medium transition-colors
                disabled:opacity-50 disabled:cursor-not-allowed
              "
            >
              {addPasswordMutation.isPending ? 'Adding Password...' : 'Add Password'}
            </button>
            <button
              type="button"
              onClick={resetForm}
              disabled={addPasswordMutation.isPending}
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
      )}
    </div>
  );
}
