/**
 * Consolidated type definitions for authentication functionality
 * This is the SINGLE SOURCE OF TRUTH for all auth-related types
 */

import type { JSX } from 'react';

// Re-export auth-utils types
export type { AuthFormData, AuthError } from '../lib/auth-utils';

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
  children: JSX.Element | JSX.Element[] | null;
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
  isSignUp: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onModeChange: (isSignUp: boolean) => void;
  onSubmit: (e: React.FormEvent) => void;
  fieldError?: string;
  loading: boolean;
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
