import { SuspenseBoundary } from '@/components/shared/SuspenseBoundary';
import EmailChangeSuccessPage from '@/features/AccountPage/pages/EmailChangeSuccessPage';

function LoadingFallback() {
  return <div className="text-center py-8">Loading...</div>;
}

export default function EmailChangedSuccess() {
  return (
    <SuspenseBoundary fallback={<LoadingFallback />}>
      <EmailChangeSuccessPage />
    </SuspenseBoundary>
  );
}
