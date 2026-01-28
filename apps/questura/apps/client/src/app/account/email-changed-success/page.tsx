import { Suspense } from 'react';
import EmailChangeSuccessPage from '@/features/AccountPage/pages/EmailChangeSuccessPage';

function LoadingFallback() {
  return <div className="text-center py-8">Loading...</div>;
}

export default function EmailChangedSuccess() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <EmailChangeSuccessPage />
    </Suspense>
  );
}
