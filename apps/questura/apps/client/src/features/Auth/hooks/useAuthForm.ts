/**
 * Hook for managing authentication form state
 */

import { useState, useEffect } from 'react';
import { validateEmail, validateAuthForm } from '../lib/auth-utils';
import type { AuthFormData, AuthError, UserAccountStatus, UseAuthFormOptions } from '../types';

export const useAuthForm = ({ prefillEmail, onModeChange }: UseAuthFormOptions = {}) => {
  const [formData, setFormData] = useState<AuthFormData>({
    email: prefillEmail || '',
    password: ''
  });
  const [errors, setErrors] = useState<AuthError[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [showPasswordStep, setShowPasswordStep] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Notify parent component when mode changes (for modal header updates)
  useEffect(() => {
    if (onModeChange) {
      onModeChange(isSignUp, showPasswordStep);
    }
  }, [isSignUp, showPasswordStep, onModeChange]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setErrors(prev => prev.filter(error => error.field !== name));
  };

  const handleBackToEmail = () => {
    setShowPasswordStep(false);
    setFormData(prev => ({ ...prev, password: '' }));
    setErrors([]);
    setShowPassword(false);
  };

  const validateForm = (): boolean => {
    const newErrors = validateAuthForm(formData, isSignUp);
    setErrors(newErrors);
    return newErrors.length === 0;
  };

  const getFieldError = (field: string): string | undefined => {
    return errors.find(error => error.field === field)?.message;
  };

  const getGeneralErrors = (): string[] => {
    return errors.filter(error => !error.field).map(error => error.message);
  };

  const proceedToPasswordStep = (accountStatus: UserAccountStatus) => {
    // Automatically set form mode based on user existence
    if (accountStatus.userExists) {
      console.log('👤 User exists - showing login form');
      setIsSignUp(false); // Show login form
    } else {
      console.log('🆕 User does not exist - showing signup form');
      setIsSignUp(true);  // Show signup form
    }

    // Show the password step after account check
    setShowPasswordStep(true);
  };

  const canContinueFromEmail = (): boolean => {
    return validateEmail(formData.email);
  };

  return {
    // Form data
    formData,
    setFormData,
    handleInputChange,

    // Errors
    errors,
    setErrors,
    getFieldError,
    getGeneralErrors,

    // Loading state
    loading,
    setLoading,

    // Form mode
    isSignUp,
    setIsSignUp,

    // Step navigation
    showPasswordStep,
    setShowPasswordStep,
    handleBackToEmail,
    proceedToPasswordStep,
    canContinueFromEmail,

    // Password visibility
    showPassword,
    setShowPassword,

    // Validation
    validateForm
  };
};
