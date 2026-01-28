"use client";

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/user/hooks';
import { EnhancedAuthForm } from '@/features/Auth';
import { isServiceUnavailableError } from '@/lib/api';
import MembershipGuard from '../components/MembershipGuard';
import { useMembership } from '../hooks/useMembership';
import { useCreateCheckoutSessionMutation } from '../hooks/useSubscriptionMutations';
import { queryKeys } from '@/lib/react-query';

interface PurchasePageProps {
  planName?: string;
  amount: number;
  planDescription?: string;
}

export default function PurchasePage({
  planName = "Monthly Plan",
  amount = 10,
  planDescription = "Cancel anytime • All premium features"
}: PurchasePageProps) {
  const { user, loading, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const { hasValidMembership } = useMembership(user);

  const checkoutMutation = useCreateCheckoutSessionMutation();
  const [authFormState, setAuthFormState] = useState<{ isSignUp: boolean; showPasswordStep: boolean }>({
    isSignUp: false,
    showPasswordStep: false
  });

  const handleAuthFormStateChange = useCallback((isSignUp: boolean, showPasswordStep: boolean) => {
    setAuthFormState({ isSignUp, showPasswordStep });
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  const handleSubscribe = () => {
    checkoutMutation.mutate({});
  };

  const handleAuthSuccess = async () => {
    // Refresh auth state - page will re-render and show payment section
    queryClient.invalidateQueries({ queryKey: queryKeys.userMe() });
    // Note: We don't auto-trigger handleSubscribe here
    // The page will re-render with isAuthenticated=true and show the payment button
  };

  if (hasValidMembership) {
    return (
      <MembershipGuard user={user}>
        <div />
      </MembershipGuard>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              Complete Your Purchase
            </h1>
            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg mb-6">
              <h2 className="text-xl font-semibold text-blue-900 dark:text-blue-100 mb-2">
                {planName}
              </h2>
              <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                ${amount}/month
              </p>
              <p className="text-blue-700 dark:text-blue-300 text-sm">
                {planDescription}
              </p>
            </div>
          </div>

          {!isAuthenticated ? (
            <div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 text-center">
                {authFormState.showPasswordStep
                  ? (authFormState.isSignUp ? 'Create Account To Complete Purchase' : 'Log In To Complete Purchase')
                  : 'Sign In To Complete Your Purchase'}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 text-center">
                {authFormState.showPasswordStep
                  ? (authFormState.isSignUp
                      ? 'Set up your password to create your account and proceed to checkout.'
                      : 'Enter your password to sign in and proceed to checkout.')
                  : 'If you have an account, you will be asked to sign in with your password. If not, the provided email address will be used to create a new account.'}
              </p>

              <EnhancedAuthForm inModal={true} onSuccess={handleAuthSuccess} onModeChange={handleAuthFormStateChange} />
            </div>
          ) : (
            <div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-6 text-center">
                Complete Your Payment
              </h3>

              <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg mb-6">
                <h4 className="font-medium text-gray-900 dark:text-white mb-2">Account Details</h4>
                <p className="text-gray-700 dark:text-gray-300">
                  <span className="font-medium">Email:</span> {user?.email}
                </p>
                {user?.firstName && user?.lastName && (
                  <p className="text-gray-700 dark:text-gray-300">
                    <span className="font-medium">Name:</span> {user.firstName} {user.lastName}
                  </p>
                )}
              </div>

              {checkoutMutation.error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
                  <p className="text-red-700 dark:text-red-300 text-sm">
                    {isServiceUnavailableError(checkoutMutation.error)
                      ? 'Service is unavailable. Please try again later.'
                      : checkoutMutation.error instanceof Error
                      ? checkoutMutation.error.message
                      : 'Failed to create checkout session'}
                  </p>
                </div>
              )}

              <button
                onClick={handleSubscribe}
                disabled={checkoutMutation.isPending}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
              >
                {checkoutMutation.isPending ? 'Creating session...' : `Subscribe Now - $${amount}/month`}
              </button>
            </div>
          )}

          <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-600">
            <p className="text-center text-sm text-gray-500 dark:text-gray-400">
              Secure payment powered by Stripe • Cancel anytime
            </p>
          </div>
        </div>
      </div>
    );
}