"use client";

import { SuspenseBoundary } from '@/components/shared/SuspenseBoundary';
import AccountLinkingHandler from '@/features/Auth/components/google/AccountLinkingHandler';
import LoadingSpinner from '@/components/shared/ui/LoadingSpinner';

function AuthCallbackPageContent() {
  return <AccountLinkingHandler />;
}

export default function AuthCallbackPage() {
  return (
    <SuspenseBoundary fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <LoadingSpinner />
      </div>
    }>
      <AuthCallbackPageContent />
    </SuspenseBoundary>
  );
}
