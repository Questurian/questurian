import type { EmailChangeStep } from '../types/email-change.types';

export const EMAIL_CHANGE_STEP_COPY: Record<EmailChangeStep, { title: string; description: string }> = {
  verifyPassword: {
    title: 'Verify Your Password',
    description: 'Step 1 of 3',
  },
  enterNewEmail: {
    title: 'Change Email Address',
    description: 'Step 2 of 3',
  },
  verifyNewEmail: {
    title: 'Verify New Email',
    description: 'Step 3 of 3',
  },
};
