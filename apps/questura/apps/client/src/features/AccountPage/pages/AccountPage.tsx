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
import { useEffect } from "react";
import { SuspenseBoundary } from "@/components/shared/SuspenseBoundary";

function AccountContent() {
  const router = useRouter();
  const searchParams = useSearchParams() ?? new URLSearchParams();
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
    <div className="min-h-screen">
      {/* ── Header ── */}
      <header className="px-4 480:px-6 pt-8 480:pt-12 768:pt-14">
        <div className="max-w-2xl mx-auto">
          <h1
            className="
              font-display text-[1.45rem] text-[#1A1A1A] leading-[1.15]
              480:text-[1.8rem]
              768:text-[2.1rem]
            "
          >
            Your Account
          </h1>
        </div>
      </header>

      {/* ── Sections ── */}
      <section className="px-4 480:px-6 pt-6 480:pt-10 pb-16 768:pt-12 768:pb-20">
        <div className="max-w-2xl mx-auto space-y-4 480:space-y-5 768:space-y-6">
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
      </section>
    </div>
  );
}

export default function AccountPage() {
  return (
    <SuspenseBoundary fallback={<LoadingSpinner />}>
      <AccountContent />
    </SuspenseBoundary>
  );
}
