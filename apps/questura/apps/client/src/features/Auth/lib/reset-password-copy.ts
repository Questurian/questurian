export function getResetPasswordTitle(skipEmailStep: boolean, currentStep: 1 | 2): string {
  if (skipEmailStep) {
    return '';
  }

  if (currentStep === 1) {
    return 'Reset Password';
  }

  return 'Verify and Reset';
}

export function getResetPasswordSubtitle(skipEmailStep: boolean, currentStep: 1 | 2, email: string): string {
  if (skipEmailStep) {
    return '';
  }

  if (currentStep === 1) {
    return 'Enter your email to receive a password reset code';
  }

  return `We've sent a code to ${email}. Enter it along with your new password.`;
}
