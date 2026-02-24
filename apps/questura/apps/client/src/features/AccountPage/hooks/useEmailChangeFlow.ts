import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/user/hooks';
import {
  useConfirmEmailChangeMutation,
  useRequestEmailChangeMutation,
  useVerifyPasswordMutation,
} from './useEmailChangeMutations';
import { buildEmailChangeSuccessUrl, mapEmailChangeError } from '../services/email-change.service';
import type { EmailChangeStep } from '../types/email-change.types';

export function useEmailChangeFlow() {
  const router = useRouter();
  const { user, loading, isAuthenticated } = useAuth();

  const [step, setStep] = useState<EmailChangeStep>('verifyPassword');
  const [password, setPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [willUnlinkGoogle, setWillUnlinkGoogle] = useState(false);

  const verifyPasswordMutation = useVerifyPasswordMutation();
  const requestEmailChangeMutation = useRequestEmailChangeMutation();
  const confirmEmailChangeMutation = useConfirmEmailChangeMutation();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push('/?showLogin=true&redirect=/account/change-email');
    }
  }, [loading, isAuthenticated, router]);

  useEffect(() => {
    if (user && !loading) {
      const hasPassword = user.hasLocalPassword || user.authProvider === 'local' || user.authProvider === 'dual';
      if (!hasPassword) {
        router.push('/account');
      }
    }
  }, [user, loading, router]);

  const handleVerifyPassword = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    verifyPasswordMutation.mutate(
      { password },
      {
        onSuccess: (data) => {
          if (data.success) {
            setStep('enterNewEmail');
            return;
          }
          setError('Incorrect password. Please try again.');
        },
        onError: (mutationError) => {
          setError(
            mapEmailChangeError(mutationError, 'Failed to verify password. Please try again.', {
              noPasswordSetMessage:
                'You must add a password to your account before changing your email.',
            })
          );
        },
      }
    );
  };

  const handleRequestChange = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    requestEmailChangeMutation.mutate(
      { newEmail },
      {
        onSuccess: (data) => {
          if (data.willUnlinkGoogle) {
            setWillUnlinkGoogle(true);
          }
          setStep('verifyNewEmail');
        },
        onError: (mutationError) => {
          setError(mapEmailChangeError(mutationError, 'Failed to request email change. Please try again.'));
        },
      }
    );
  };

  const handleConfirmChange = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    confirmEmailChangeMutation.mutate(
      { code: verificationCode },
      {
        onSuccess: (data) => {
          window.location.href = buildEmailChangeSuccessUrl(data.newEmail, data.wasGoogleUnlinked);
        },
        onError: (mutationError) => {
          setError(mapEmailChangeError(mutationError, 'Failed to confirm email change. Please try again.'));
        },
      }
    );
  };

  const handleBack = () => {
    if (step === 'verifyNewEmail') {
      setStep('enterNewEmail');
      setVerificationCode('');
      setError(null);
      return;
    }

    if (step === 'enterNewEmail') {
      setStep('verifyPassword');
      setNewEmail('');
      setError(null);
      return;
    }

    router.push('/account');
  };

  return {
    loading,
    isAuthenticated,
    userEmail: user?.email ?? '',
    step,
    password,
    newEmail,
    verificationCode,
    error,
    willUnlinkGoogle,
    verifyPasswordPending: verifyPasswordMutation.isPending,
    requestEmailChangePending: requestEmailChangeMutation.isPending,
    confirmEmailChangePending: confirmEmailChangeMutation.isPending,
    setPassword,
    setNewEmail,
    setVerificationCode,
    handleVerifyPassword,
    handleRequestChange,
    handleConfirmChange,
    handleBack,
    goToAccount: () => router.push('/account'),
  };
}
