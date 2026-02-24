import ResetPasswordEmailStep from './ResetPasswordEmailStep';
import ResetPasswordVerifyStep from './ResetPasswordVerifyStep';
import type { ResetPasswordStepRendererProps } from '../../types/reset-password-flow.types';

export default function ResetPasswordStepRenderer({
  skipEmailStep,
  currentStep,
  email,
  code,
  newPassword,
  confirmPassword,
  loading,
  showPassword,
  inModal,
  fieldError,
  onChange,
  onEmailSubmit,
  onVerifySubmit,
  onBackToEmail,
  onTogglePassword,
  onRequestNewCode,
}: ResetPasswordStepRendererProps) {
  if (skipEmailStep) {
    return (
      <ResetPasswordVerifyStep
        email={email}
        code={code}
        newPassword={newPassword}
        confirmPassword={confirmPassword}
        onChange={onChange}
        onSubmit={onVerifySubmit}
        onBackToEmail={onBackToEmail}
        fieldError={fieldError}
        loading={loading}
        showPassword={showPassword}
        onTogglePassword={onTogglePassword}
        inModal={inModal}
        generalError={undefined}
        currentStep={currentStep}
        onRequestNewCode={onRequestNewCode}
      />
    );
  }

  if (currentStep === 1) {
    return (
      <ResetPasswordEmailStep
        email={email}
        onChange={onChange}
        onSubmit={onEmailSubmit}
        fieldError={fieldError}
        loading={loading}
        inModal={inModal}
        generalError={undefined}
      />
    );
  }

  return (
    <ResetPasswordVerifyStep
      email={email}
      code={code}
      newPassword={newPassword}
      confirmPassword={confirmPassword}
      onChange={onChange}
      onSubmit={onVerifySubmit}
      onBackToEmail={onBackToEmail}
      fieldError={fieldError}
      loading={loading}
      showPassword={showPassword}
      onTogglePassword={onTogglePassword}
      inModal={inModal}
      generalError={undefined}
      currentStep={currentStep}
      onRequestNewCode={onRequestNewCode}
    />
  );
}
