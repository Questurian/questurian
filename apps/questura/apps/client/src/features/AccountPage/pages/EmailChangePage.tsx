"use client";

import LoadingSpinner from '@/components/shared/ui/LoadingSpinner';
import EmailChangeLayout from '../components/EmailChange/EmailChangeLayout';
import EnterNewEmailForm from '../components/EmailChange/EnterNewEmailForm';
import VerifyNewEmailForm from '../components/EmailChange/VerifyNewEmailForm';
import VerifyPasswordForm from '../components/EmailChange/VerifyPasswordForm';
import { useEmailChangeFlow } from '../hooks/useEmailChangeFlow';

export default function EmailChangePage() {
  const flow = useEmailChangeFlow();

  if (flow.loading) {
    return <LoadingSpinner />;
  }

  if (!flow.isAuthenticated) {
    return null;
  }

  return (
    <EmailChangeLayout step={flow.step} error={flow.error} onBackToAccount={flow.goToAccount}>
      {flow.step === 'verifyPassword' ? (
        <VerifyPasswordForm
          password={flow.password}
          isPending={flow.verifyPasswordPending}
          onPasswordChange={flow.setPassword}
          onSubmit={flow.handleVerifyPassword}
          onCancel={flow.handleBack}
        />
      ) : null}

      {flow.step === 'enterNewEmail' ? (
        <EnterNewEmailForm
          currentEmail={flow.userEmail}
          newEmail={flow.newEmail}
          isPending={flow.requestEmailChangePending}
          onNewEmailChange={flow.setNewEmail}
          onSubmit={flow.handleRequestChange}
          onBack={flow.handleBack}
        />
      ) : null}

      {flow.step === 'verifyNewEmail' ? (
        <VerifyNewEmailForm
          newEmail={flow.newEmail}
          verificationCode={flow.verificationCode}
          willUnlinkGoogle={flow.willUnlinkGoogle}
          isPending={flow.confirmEmailChangePending}
          onVerificationCodeChange={flow.setVerificationCode}
          onSubmit={flow.handleConfirmChange}
          onBack={flow.handleBack}
        />
      ) : null}
    </EmailChangeLayout>
  );
}
