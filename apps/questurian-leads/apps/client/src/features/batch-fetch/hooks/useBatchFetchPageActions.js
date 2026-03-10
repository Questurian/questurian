import { useStartBatchFetch } from '../../../hooks';
import { useDialog } from '../../../providers/DialogProvider';

export function useBatchFetchPageActions() {
  const dialog = useDialog();
  const startBatchFetch = useStartBatchFetch();

  async function handleStart(force = false) {
    const message = force
      ? 'Force run now? This will ignore the 24-hour skip window (inactive feeds still skip). Instagram calls will be spaced out by 5-10 seconds.'
      : 'Run daily fetch now? Instagram calls will be spaced out by 5-10 seconds and sources fetched in the last 24 hours will be skipped.';
    const confirmed = await dialog.confirm(message);

    if (!confirmed) return;

    try {
      await startBatchFetch.mutateAsync(force ? { force: true } : {});
      await dialog.alert(
        'Batch fetch started. You can leave this page open to watch progress.',
      );
    } catch (error) {
      await dialog.alert(`Error: ${error.message}`);
    }
  }

  return {
    handleStart,
    startPending: startBatchFetch.isPending,
  };
}
