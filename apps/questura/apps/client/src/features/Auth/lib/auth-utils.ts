/**
 * Utility functions for authentication operations
 */

export const isPopupWindow = (): boolean => {
  const isPopup = window.opener && window.opener !== window;
  const isNamedPopup = window.name === 'googleAuth';
  const hasPopupFeatures = window.outerWidth < 600 && window.outerHeight < 700;
  
  return isPopup || isNamedPopup || hasPopupFeatures;
};

export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export interface PasswordRequirements {
  hasMinLength: boolean;
  hasNumber: boolean;
  hasUppercase: boolean;
  hasSymbol: boolean;
}

export const validatePasswordRequirements = (password: string): PasswordRequirements => {
  return {
    hasMinLength: password.length >= 8,
    hasNumber: /\d/.test(password),
    hasUppercase: /[A-Z]/.test(password),
    hasSymbol: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
  };
};

export const isPasswordValid = (password: string): boolean => {
  const requirements = validatePasswordRequirements(password);
  return requirements.hasMinLength &&
         requirements.hasNumber &&
         requirements.hasUppercase &&
         requirements.hasSymbol;
};

export interface AuthFormData {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

export interface AuthError {
  message: string;
  field?: string;
}

export const createAuthFormHandlers = (
  formData: AuthFormData,
  setFormData: React.Dispatch<React.SetStateAction<AuthFormData>>,
  errors: AuthError[],
  setErrors: React.Dispatch<React.SetStateAction<AuthError[]>>,
  isSignUp: boolean,
  setIsSignUp: React.Dispatch<React.SetStateAction<boolean>>
) => {
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setErrors(prev => prev.filter(error => error.field !== name));
  };

  const getFieldError = (field: string): string | undefined => {
    return errors.find(error => error.field === field)?.message;
  };

  const getGeneralErrors = (): string[] => {
    return errors.filter(error => !error.field).map(error => error.message);
  };

  const toggleMode = () => {
    setIsSignUp(!isSignUp);
    setErrors([]);
  };

  return {
    handleInputChange,
    getFieldError,
    getGeneralErrors,
    toggleMode
  };
};

/**
 * Validates the entire auth form based on current state
 */
export const validateAuthForm = (
  formData: AuthFormData,
  isSignUp: boolean
): AuthError[] => {
  const errors: AuthError[] = [];

  if (!formData.email) {
    errors.push({ message: 'Email is required', field: 'email' });
  } else if (!validateEmail(formData.email)) {
    errors.push({ message: 'Please enter a valid email address', field: 'email' });
  }

  if (!formData.password) {
    errors.push({ message: 'Password is required', field: 'password' });
  } else if (isSignUp) {
    const requirements = validatePasswordRequirements(formData.password);
    if (!requirements.hasMinLength) {
      errors.push({ message: 'Password must be at least 8 characters', field: 'password' });
    } else if (!requirements.hasNumber) {
      errors.push({ message: 'Password must contain at least one number', field: 'password' });
    } else if (!requirements.hasUppercase) {
      errors.push({ message: 'Password must contain at least one uppercase letter', field: 'password' });
    } else if (!requirements.hasSymbol) {
      errors.push({ message: 'Password must contain at least one symbol', field: 'password' });
    }
  }

  return errors;
};

/**
 * Get the dynamic title based on form state
 */
export const getFormTitle = (
  showPasswordStep: boolean,
  isSignUp: boolean,
  customTitle?: string
): string => {
  if (customTitle) return customTitle;

  if (showPasswordStep) {
    return isSignUp ? 'Create Your Account' : 'Welcome Back';
  }
  return 'Sign In or Sign Up';
};

/**
 * Get the dynamic subtitle based on form state
 */
export const getFormSubtitle = (
  showPasswordStep: boolean,
  isSignUp: boolean,
  customSubtitle?: string
): string => {
  if (customSubtitle) return customSubtitle;

  if (showPasswordStep) {
    return isSignUp
      ? 'Set up your password to create your account'
      : 'Enter your password to sign in';
  }
  return 'Enter your email to continue';
};