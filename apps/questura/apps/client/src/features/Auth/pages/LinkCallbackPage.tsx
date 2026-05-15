"use client";

import { SuspenseBoundary } from '@/components/shared/SuspenseBoundary';
import AccountLinkingHandler from '../components/google/AccountLinkingHandler';
import LoadingSpinner from '../../../components/shared/ui/LoadingSpinner';

function LinkCallbackPageContent() {
  return <AccountLinkingHandler />;
}

export default function LinkCallbackPage() {
  return (
    <SuspenseBoundary fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <LoadingSpinner />
      </div>
    }>
      <LinkCallbackPageContent />
    </SuspenseBoundary>
  );
}
