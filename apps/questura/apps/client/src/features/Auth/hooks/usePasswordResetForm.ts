/**
 * Hook for managing password reset form state
 */

import { useState } from 'react';
import { validateEmail, isPasswordValid } from '../lib/auth-utils';
import type { AuthError } from '../types';

export const usePasswordResetForm = (initialEmail = '', initialStep: 1 | 2 = 1) => {
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<AuthError[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState<1 | 2>(initialStep);
  const [showPassword, setShowPassword] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    switch (name) {
      case 'email':
        setEmail(value);
        break;
      case 'code':
        // Only allow digits, max 6 characters
        if (/^\d*$/.test(value) && value.length <= 6) {
          setCode(value);
        }
        break;
      case 'newPassword':
        setNewPassword(value);
        break;
      case 'confirmPassword':
        setConfirmPassword(value);
        break;
    }

    // Clear field-specific error when user starts typing
    setErrors(prev => prev.filter(error => error.field !== name));
  };

  const validateEmailStep = (): boolean => {
    const newErrors: AuthError[] = [];

    if (!email) {
      newErrors.push({ message: 'Email is required', field: 'email' });
    } else if (!validateEmail(email)) {
      newErrors.push({ message: 'Please enter a valid email address', field: 'email' });
    }

    setErrors(newErrors);
    return newErrors.length === 0;
  };

  const validateVerifyStep = (): boolean => {
    const newErrors: AuthError[] = [];

    if (!code) {
      newErrors.push({ message: 'Verification code is required', field: 'code' });
    } else if (code.length !== 6) {
      newErrors.push({ message: 'Verification code must be 6 digits', field: 'code' });
    }

    if (!newPassword) {
      newErrors.push({ message: 'Password is required', field: 'newPassword' });
    } else if (!isPasswordValid(newPassword)) {
      newErrors.push({
        message: 'Password must be at least 8 characters with uppercase, number, and symbol',
        field: 'newPassword'
      });
    }

    if (!confirmPassword) {
      newErrors.push({ message: 'Please confirm your password', field: 'confirmPassword' });
    } else if (newPassword !== confirmPassword) {
      newErrors.push({ message: 'Passwords do not match', field: 'confirmPassword' });
    }

    setErrors(newErrors);
    return newErrors.length === 0;
  };

  const getFieldError = (field: string): string | undefined => {
    return errors.find(error => error.field === field)?.message;
  };

  const getGeneralErrors = (): string[] => {
    return errors.filter(error => !error.field).map(error => error.message);
  };

  const proceedToVerifyStep = () => {
    setCurrentStep(2);
    setErrors([]);
  };

  const backToEmailStep = () => {
    setCurrentStep(1);
    setCode('');
    setNewPassword('');
    setConfirmPassword('');
    setErrors([]);
    setShowPassword(false);
  };

  const addGeneralError = (message: string) => {
    setErrors(prev => [...prev, { message }]);
  };

  const clearErrors = () => {
    setErrors([]);
  };

  return {
    // Step 1: Email
    email,
    setEmail,

    // Step 2: Verify
    code,
    setCode,
    newPassword,
    setNewPassword,
    confirmPassword,
    setConfirmPassword,

    // State
    errors,
    setErrors,
    loading,
    setLoading,
    currentStep,
    showPassword,
    setShowPassword,

    // Methods
    handleInputChange,
    validateEmailStep,
    validateVerifyStep,
    getFieldError,
    getGeneralErrors,
    proceedToVerifyStep,
    backToEmailStep,
    addGeneralError,
    clearErrors
  };
};
