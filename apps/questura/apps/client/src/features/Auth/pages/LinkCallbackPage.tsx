"use client";

import { Suspense } from 'react';
import AccountLinkingHandler from '../components/google/AccountLinkingHandler';
import LoadingSpinner from '../../../components/shared/ui/LoadingSpinner';

function LinkCallbackPageContent() {
  return <AccountLinkingHandler />;
}

export default function LinkCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <LoadingSpinner />
      </div>
    }>
      <LinkCallbackPageContent />
    </Suspense>
  );
}