"use client";

import { useAuth } from "@/lib/user/hooks";
import { useAccount } from "../hooks/useAccount";
import  LoadingSpinner from "@/components/shared/ui/LoadingSpinner";

import { AdminRedirectView } from "../components/shared/AdminRedirectView";
import { EmailSection } from "../components/Email/EmailSection";
import { PasswordSection } from "../components/Password/PasswordSection";
import { ConnectedAccountsSection } from "../components/ConnectedAccounts/ConnectedAccountsSection";
import { MembershipSection } from "../components/Membership/MembershipSection";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, Suspense } from "react";

function AccountContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading, isAuthenticated } = useAuth();
  const {
    error,
    success,
    clearMessages,
    passwordError,
    passwordSuccess,
    clearPasswordMessages,
    setPasswordSuccess,
    handleLinkGoogle,
    handleUnlinkGoogle
  } = useAccount();

  // Redirect to home with login modal if not authenticated
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push('/?showLogin=true&redirect=/account');
    }
  }, [loading, isAuthenticated, router]);

  // Check for password change/add success from query params
  useEffect(() => {
    if (searchParams.get('passwordChanged') === 'true') {
      setPasswordSuccess('Password changed successfully!');
      // Remove the query param
      router.replace('/account');
    } else if (searchParams.get('passwordAdded') === 'true') {
      setPasswordSuccess('Password added successfully! You can now sign in with email and password.');
      // Remove the query param
      router.replace('/account');
    }
  }, [searchParams, setPasswordSuccess, router]);

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    return null; // Will redirect via useEffect
  }

  if (user?.role === "admin" || user?.role === "editor") {
    return <AdminRedirectView />;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Account
            </h1>
            <p className="text-gray-600 dark:text-gray-300">
              Welcome back, {user?.email}!
            </p>
          </div>
        </div>

        <div className="space-y-8">
          <EmailSection user={user} />

          <PasswordSection
            user={user}
            passwordSuccess={passwordSuccess}
            passwordError={passwordError}
            onClearPasswordMessages={clearPasswordMessages}
          />

          <ConnectedAccountsSection
            user={user}
            onLinkGoogle={handleLinkGoogle}
            onUnlinkGoogle={handleUnlinkGoogle}
            success={success}
            error={error}
            onClearMessages={clearMessages}
          />

          <MembershipSection user={user} />
        </div>
      </div>
    </div>
  );
}

export default function AccountPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <AccountContent />
    </Suspense>
  );
}