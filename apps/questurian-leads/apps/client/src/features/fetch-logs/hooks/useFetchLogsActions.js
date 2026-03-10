import { useDeleteFetchLog } from '../../../hooks';
import { useDialog } from '../../../providers/DialogProvider';

export function useFetchLogsActions() {
  const dialog = useDialog();
  const deleteLog = useDeleteFetchLog();

  async function handleDelete(id) {
    const confirmed = await dialog.confirm(
      'Are you sure you want to delete this log?',
    );

    if (!confirmed) return;

    try {
      await deleteLog.mutateAsync(id);
    } catch (error) {
      await dialog.alert(`Error: ${error.message}`);
    }
  }

  return {
    handleDelete,
    isMutating: deleteLog.isPending,
  };
}
