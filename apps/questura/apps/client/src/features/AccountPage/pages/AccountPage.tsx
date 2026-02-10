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
    <div className="min-h-screen">
      {/* ── Header ── */}
      <header className="px-6 pt-10 pb-2 480:pt-12 768:pt-14">
        <div className="max-w-2xl mx-auto">
          <p
            className="
              text-[0.68rem] uppercase tracking-[0.18em] font-semibold
              text-[#9a9894] mb-3
            "
          >
            Account Settings
          </p>
          <h1
            className="
              font-display text-[1.55rem] text-[#1A1A1A] leading-[1.15]
              480:text-[1.8rem]
              768:text-[2.1rem]
            "
          >
            Your Account
          </h1>
          <p
            className="
              mt-2.5 text-[0.9rem] text-[#6b6a68] leading-[1.6]
              480:text-[0.95rem]
              768:text-[1rem]
            "
          >
            {user?.email}
          </p>
        </div>
      </header>

      {/* ── Sections ── */}
      <section className="px-6 pt-8 pb-16 480:pt-10 768:pt-12 768:pb-20">
        <div className="max-w-2xl mx-auto space-y-5 768:space-y-6">
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
    <Suspense fallback={<LoadingSpinner />}>
      <AccountContent />
    </Suspense>
  );
}
