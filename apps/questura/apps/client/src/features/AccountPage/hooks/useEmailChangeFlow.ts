import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/user/hooks';
import { useRequestEmailChangeMutation, useVerifyPasswordMutation } from './useEmailChangeMutations';
import { mapEmailChangeError } from '../services/email-change.service';
import type { EmailChangeStep } from '../types/email-change.types';

export function useEmailChangeFlow() {
  const router = useRouter();
  const { user, loading, isAuthenticated } = useAuth();

  const [step, setStep] = useState<EmailChangeStep>('verifyPassword');
  const [password, setPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  const verifyPasswordMutation = useVerifyPasswordMutation();
  const requestEmailChangeMutation = useRequestEmailChangeMutation();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push('/?showLogin=true&redirect=/account/change-email');
    }
  }, [loading, isAuthenticated, router]);

  useEffect(() => {
    if (user && !loading) {
      const hasPassword = user.hasLocalPassword || user.authProvider === 'local' || user.authProvider === 'dual';
      if (!hasPassword || user.hasGoogleOAuth) {
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
        onSuccess: () => {
          setStep('verifyNewEmail');
        },
        onError: (mutationError) => {
          setError(mapEmailChangeError(mutationError, 'Failed to request email change. Please try again.'));
        },
      }
    );
  };

  const handleBack = () => {
    if (step === 'verifyNewEmail') {
      setStep('enterNewEmail');
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
    error,
    verifyPasswordPending: verifyPasswordMutation.isPending,
    requestEmailChangePending: requestEmailChangeMutation.isPending,
    setPassword,
    setNewEmail,
    handleVerifyPassword,
    handleRequestChange,
    handleBack,
    goToAccount: () => router.push('/account'),
  };
}
