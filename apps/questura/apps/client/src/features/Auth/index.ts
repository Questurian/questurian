// Pages
export { default as AuthPage } from './pages/AuthPage';
export { default as AuthErrorPage } from './pages/AuthErrorPage';

// Form Components
export { default as EnhancedAuthForm } from './components/form/EnhancedAuthForm';
export { default as AuthFormLayout } from './components/form/AuthFormLayout';
export { default as EmailStep } from './components/form/EmailStep';
export { default as PasswordStep } from './components/form/PasswordStep';

// Other Components
export { default as PasswordStrengthIndicator } from './components/PasswordStrengthIndicator';

// Google OAuth components
export { default as GoogleSignInButton } from './components/google/GoogleSignInButton';

// Hooks
export { useAuthForm } from './hooks/useAuthForm';
export { useAuthSubmit } from './hooks/useAuthSubmit';

// Utilities
export * from './lib/auth-utils';

// Types
export * from './types';
