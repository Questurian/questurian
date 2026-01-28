/**
 * Consolidated type definitions for authentication functionality
 * This is the SINGLE SOURCE OF TRUTH for all auth-related types
 */

// Re-export auth-utils types
export type { AuthFormData, AuthError } from '../lib/auth-utils';

/**
 * User account status returned from the account check API
 */
export interface UserAccountStatus {
  userExists: boolean;
  hasPassword: boolean;
  hasGoogleAuth: boolean;
  email: string;
}

/**
 * Props for the main EnhancedAuthForm component
 */
export interface EnhancedAuthFormProps {
  onSuccess?: () => void;
  inModal?: boolean;
  title?: string;
  subtitle?: string;
  errorMessage?: string;
  prefillEmail?: string;
  onModeChange?: (isSignUp: boolean, showPasswordStep: boolean) => void;
}

/**
 * Props for AuthFormLayout component
 */
export interface AuthFormLayoutProps {
  children: React.ReactNode;
  inModal?: boolean;
  title?: string;
  subtitle?: string;
  generalErrors: string[];
  isSignUp: boolean;
}

/**
 * Props for EmailStep component
 */
export interface EmailStepProps {
  email: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (e: React.FormEvent) => void;
  fieldError?: string;
  loading: boolean;
  checkingAccount: boolean;
  canContinue: boolean;
  inModal?: boolean;
  errorMessage?: string;
}

/**
 * Props for PasswordStep component
 */
export interface PasswordStepProps {
  email: string;
  password: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (e: React.FormEvent) => void;
  onBackToEmail: () => void;
  fieldError?: string;
  loading: boolean;
  isSignUp: boolean;
  showPassword: boolean;
  onTogglePassword: () => void;
  userAccountStatus: UserAccountStatus | null;
  inModal?: boolean;
  errorMessage?: string;
}

/**
 * Options for useAuthForm hook
 */
export interface UseAuthFormOptions {
  prefillEmail?: string;
  onModeChange?: (isSignUp: boolean, showPasswordStep: boolean) => void;
}

/**
 * Options for useAuthSubmit hook
 */
export interface UseAuthSubmitOptions {
  inModal?: boolean;
  onSuccess?: () => void;
}

/**
 * Result from attemptSignUp function
 */
export interface SignUpResult {
  success: boolean;
  errors?: import('../lib/auth-utils').AuthError[];
}

/**
 * Password reset request payload
 */
export interface PasswordResetRequest {
  email: string;
}

/**
 * Password reset verification payload
 */
export interface PasswordResetVerify {
  email: string;
  code: string;
  newPassword: string;
  confirmPassword: string;
}

/**
 * Password reset form state
 */
export interface ResetPasswordFormState {
  email: string;
  code: string;
  newPassword: string;
  confirmPassword: string;
  errors: import('../lib/auth-utils').AuthError[];
  currentStep: 1 | 2;
}

/**
 * Props for ResetPasswordEmailStep component
 */
export interface ResetPasswordEmailStepProps {
  email: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (e: React.FormEvent) => void;
  fieldError?: string;
  loading: boolean;
  inModal?: boolean;
  generalError?: string;
}

/**
 * Props for ResetPasswordVerifyStep component
 */
export interface ResetPasswordVerifyStepProps {
  email: string;
  code: string;
  newPassword: string;
  confirmPassword: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (e: React.FormEvent) => void;
  onBackToEmail: () => void;
  fieldError?: string;
  loading: boolean;
  showPassword: boolean;
  onTogglePassword: () => void;
  inModal?: boolean;
  generalError?: string;
  currentStep?: 1 | 2;
  onRequestNewCode?: () => void;
}

/**
 * Props for EnhancedResetPasswordForm component
 */
export interface EnhancedResetPasswordFormProps {
  onSuccess?: () => void;
  inModal?: boolean;
  initialStep?: 1 | 2;
  prefillEmail?: string;
}
