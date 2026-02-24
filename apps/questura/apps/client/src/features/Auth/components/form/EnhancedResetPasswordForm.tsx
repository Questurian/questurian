'use client';

import AuthFormLayout from './AuthFormLayout';
import ResetPasswordStepRenderer from './ResetPasswordStepRenderer';
import { useEnhancedResetPasswordFlow } from '../../hooks/useEnhancedResetPasswordFlow';
import { getResetPasswordSubtitle, getResetPasswordTitle } from '../../lib/reset-password-copy';
import type { EnhancedResetPasswordFormPropsWithSkip } from '../../types/reset-password-flow.types';

export default function EnhancedResetPasswordForm(props: EnhancedResetPasswordFormPropsWithSkip) {
  const vm = useEnhancedResetPasswordFlow(props);

  return (
    <AuthFormLayout
      inModal={vm.inModal}
      title={getResetPasswordTitle(vm.skipEmailStep, vm.currentStep)}
      subtitle={getResetPasswordSubtitle(vm.skipEmailStep, vm.currentStep, vm.email)}
      generalErrors={vm.generalErrors}
      isSignUp={false}
    >
      <ResetPasswordStepRenderer
        skipEmailStep={vm.skipEmailStep}
        currentStep={vm.currentStep}
        email={vm.email}
        code={vm.code}
        newPassword={vm.newPassword}
        confirmPassword={vm.confirmPassword}
        loading={vm.loading}
        showPassword={vm.showPassword}
        inModal={vm.inModal}
        fieldError={vm.fieldError}
        onChange={vm.onChange}
        onEmailSubmit={vm.onEmailSubmit}
        onVerifySubmit={vm.onVerifySubmit}
        onBackToEmail={vm.onBackToEmail}
        onTogglePassword={vm.onTogglePassword}
        onRequestNewCode={vm.onRequestNewCode}
      />
    </AuthFormLayout>
  );
}
