"use client";

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/user/hooks';
import { EnhancedAuthForm } from '@/features/Auth';
import { isServiceUnavailableError, post } from '@/lib/api';
import MembershipGuard from '../components/MembershipGuard';
import { useCreateCheckoutSessionMutation } from '../hooks/useSubscriptionMutations';
import { formatPlanPrice, getPlanSaving, useMembershipPlan, type PlanId } from '../hooks/useMembershipPlan';
import { queryKeys } from '@/lib/react-query';

interface PurchasePageProps {
  planName?: string;
  /** Which plan to sell. Advertised amount is the catalog via /api/payments/plans. */
  plan?: PlanId;
  planDescription?: string;
}

export default function PurchasePage({
  planName = "Monthly Plan",
  plan = 'monthly',
  planDescription = "All premium features"
}: PurchasePageProps) {
  const { user, loading, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const checkoutMutation = useCreateCheckoutSessionMutation();
  const { plan: pricing, isLoading: pricingLoading, isUnavailable: pricingUnavailable } = useMembershipPlan(plan);
  const priceLabel = pricing ? formatPlanPrice(pricing) : null;
  const saving = pricing ? getPlanSaving(pricing) : null;
  const [verificationEmailStatus, setVerificationEmailStatus] = useState<string | null>(null);
  const [sendingVerificationEmail, setSendingVerificationEmail] = useState(false);
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
        <div className="text-[0.88rem] text-[#6b6a68]">Loading...</div>
      </div>
    );
  }

  const handleSubscribe = () => {
    checkoutMutation.mutate({ plan });
  };

  const handleAuthSuccess = async () => {
    // Refresh auth state - page will re-render and show payment section
    queryClient.invalidateQueries({ queryKey: queryKeys.userMe() });
    // Note: We don't auto-trigger handleSubscribe here
    // The page will re-render with isAuthenticated=true and show the payment button
  };

  const handleResendVerificationEmail = async () => {
    if (!user) return;

    setSendingVerificationEmail(true);
    setVerificationEmailStatus(null);
    try {
      await post('/api/visitor-auth/send-verification-email', {
        email: user.email,
        callbackURL: new URL('/', window.location.origin).toString(),
      });
      setVerificationEmailStatus('Verification email sent.');
    } catch (error) {
      setVerificationEmailStatus(
        error instanceof Error ? error.message : 'Failed to send verification email.'
      );
    } finally {
      setSendingVerificationEmail(false);
    }
  };

  return (
    <MembershipGuard user={user}>
      <div className="min-h-screen">
        <div className="px-6 pt-8 pb-16 480:pt-10 768:pt-12">
          <div className="max-w-xl mx-auto">
            <div className="mb-8">
              <h1 className="font-display text-[1.35rem] text-[#1A1A1A] 480:text-[1.55rem] 768:text-[1.75rem]">
                Complete Your Purchase
              </h1>
            </div>

            <div className="bg-[#f7f6f2] border border-[#d7d4ce] rounded-sm p-6 480:p-8">
              <div className="bg-white border border-[#e5e2dc] rounded-sm p-4 mb-6">
                <h2 className="font-display text-[1.1rem] text-[#1A1A1A] mb-1">
                  {planName}
                </h2>
                <p className="font-display text-[1.35rem] text-[#1A1A1A]">
                  {saving ? (
                    <span className="mr-2 text-[1rem] font-normal text-[#9a9894] line-through">
                      {saving.compareAt}
                    </span>
                  ) : null}
                  {priceLabel ?? (pricingLoading ? 'Loading price…' : 'Price unavailable')}
                </p>
                {saving ? (
                  <p className="mt-1 text-[0.84rem] font-medium text-[#2e7d32]">
                    Save {saving.saved} ({saving.percentOff}% off)
                  </p>
                ) : null}
                <p className="mt-1 text-[0.82rem] text-[#6b6a68]">
                  {planDescription}
                </p>
              </div>

              {!isAuthenticated ? (
                <div>
                  <h3 className="font-display text-[1.1rem] text-[#1A1A1A] mb-2 text-center">
                    {authFormState.showPasswordStep
                      ? (authFormState.isSignUp ? 'Create Account To Complete Purchase' : 'Log In To Complete Purchase')
                      : 'Sign In To Complete Your Purchase'}
                  </h3>
                  <p className="text-[0.88rem] text-[#6b6a68] leading-[1.65] mb-6 text-center">
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
                  <h3 className="font-display text-[1.1rem] text-[#1A1A1A] mb-5 text-center">
                    Complete Your Payment
                  </h3>

                  <div className="bg-white border border-[#e5e2dc] rounded-sm p-4 mb-6">
                    <h4 className="text-[0.84rem] font-medium text-[#1A1A1A] mb-1">Account Details</h4>
                    <p className="text-[0.88rem] text-[#6b6a68]">
                      <span className="font-medium text-[#4f4e4b]">Email:</span> {user?.email}
                    </p>
                    {user?.kind === 'visitor' && user.firstName && user.lastName && (
                      <p className="text-[0.88rem] text-[#6b6a68]">
                        <span className="font-medium text-[#4f4e4b]">Name:</span> {user.firstName} {user.lastName}
                      </p>
                    )}
                  </div>

                  {checkoutMutation.error ? (
                    <div className="bg-[#fce4ec] border border-[#f8bbd0] rounded-sm p-3.5 mb-6">
                      <p className="text-[0.84rem] text-[#c62828]">
                        {isServiceUnavailableError(checkoutMutation.error)
                          ? 'Service is unavailable. Please try again later.'
                          : checkoutMutation.error instanceof Error
                          ? checkoutMutation.error.message
                          : 'Failed to create checkout session'}
                      </p>
                    </div>
                  ) : null}

                  <button
                    onClick={handleSubscribe}
                    disabled={checkoutMutation.isPending || pricingLoading || pricingUnavailable}
                    className="
                      w-full bg-[#2C2C2C] hover:bg-[#1A1A1A]
                      text-white text-center py-3 rounded
                      text-[0.88rem] font-medium transition-colors
                      disabled:opacity-50 disabled:cursor-not-allowed
                    "
                  >
                    {checkoutMutation.isPending
                      ? 'Creating session...'
                      : priceLabel
                        ? `Subscribe Now - ${priceLabel}`
                        : 'Subscribe Now'}
                  </button>

                  {!user?.emailVerified && (
                    <div className="mt-4 space-y-2 text-center">
                      <p className="text-[0.82rem] text-[#6b6a68] leading-[1.65]">
                        Your email isn&apos;t verified yet. You can subscribe now and verify later.
                      </p>
                      <button
                        type="button"
                        onClick={handleResendVerificationEmail}
                        disabled={sendingVerificationEmail}
                        className="
                          text-[0.82rem] text-[#6b6a68] hover:text-[#1A1A1A]
                          underline underline-offset-2 cursor-pointer transition-colors
                          disabled:text-[#c4c2be] disabled:hover:text-[#c4c2be]
                          disabled:cursor-not-allowed
                        "
                      >
                        {sendingVerificationEmail ? 'Sending...' : 'Resend verification email'}
                      </button>
                      {verificationEmailStatus && (
                        <p className="text-[0.82rem] text-[#6b6a68]">
                          {verificationEmailStatus}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="mt-8 pt-5 border-t border-[#e5e2dc]">
                <p className="text-center text-[0.78rem] text-[#9a9894]">
                  Secure payment powered by Stripe
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </MembershipGuard>
  );
}
