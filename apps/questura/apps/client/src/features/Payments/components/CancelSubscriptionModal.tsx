import type { CancelSubscriptionModalProps } from '../types';

export function CancelSubscriptionModal({
  show,
  onConfirm,
  onClose,
  isLoading = false,
  membershipExpiration
}: CancelSubscriptionModalProps) {
  if (!show) return null;

  const formatExpirationDate = (date: string | Date | null | undefined) => {
    if (!date) return 'the end of your current billing period';
    try {
      return new Date(date).toLocaleDateString();
    } catch {
      return 'the end of your current billing period';
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 dark:bg-gray-900 dark:bg-opacity-75 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
          Cancel Subscription
        </h3>

        <div className="mb-6">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            Are you sure you want to cancel your subscription?
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Your premium access will continue until {formatExpirationDate(membershipExpiration)},
            and then your account will revert to the free plan.
          </p>
        </div>

        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md p-3 mb-6">
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            <strong>Note:</strong> This action cannot be undone. You&apos;ll need to subscribe again to regain premium access.
          </p>
        </div>

        <div className="flex space-x-3">
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="flex-1 inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isLoading ? 'Cancelling...' : 'Yes, Cancel Subscription'}
          </button>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 inline-flex justify-center items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            Keep Subscription
          </button>
        </div>
      </div>
    </div>
  );
}