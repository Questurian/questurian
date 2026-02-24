import type { ChangeEvent, FormEvent } from 'react';

import type { EnhancedResetPasswordFormProps } from './index';

export interface EnhancedResetPasswordFormPropsWithSkip extends EnhancedResetPasswordFormProps {
  skipEmailStep?: boolean;
  onStepChange?: (step: number) => void;
}

export interface ResetPasswordStepRendererProps {
  skipEmailStep: boolean;
  currentStep: 1 | 2;
  email: string;
  code: string;
  newPassword: string;
  confirmPassword: string;
  loading: boolean;
  showPassword: boolean;
  inModal: boolean;
  fieldError?: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onEmailSubmit: (e: FormEvent) => Promise<void>;
  onVerifySubmit: (e: FormEvent) => Promise<void>;
  onBackToEmail: () => void;
  onTogglePassword: () => void;
  onRequestNewCode: () => Promise<void>;
}
