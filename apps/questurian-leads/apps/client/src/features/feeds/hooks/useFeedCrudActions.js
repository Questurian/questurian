import {
  useCreateFeed,
  useDeleteFeed,
  useUpdateFeed,
} from '../../../hooks';
import { useDialog } from '../../../providers/DialogProvider';

export function useFeedCrudActions({
  editingId,
  formData,
  onCancel,
}) {
  const dialog = useDialog();
  const createFeed = useCreateFeed();
  const updateFeed = useUpdateFeed();
  const deleteFeed = useDeleteFeed();

  async function handleSubmit(event) {
    event.preventDefault();

    try {
      if (editingId) {
        await updateFeed.mutateAsync({ id: editingId, data: formData });
      } else {
        await createFeed.mutateAsync(formData);
      }

      onCancel();
    } catch (error) {
      await dialog.alert(`Error: ${error.message}`);
    }
  }

  async function handleDelete(id) {
    const confirmed = await dialog.confirm(
      'Are you sure you want to delete this feed?',
    );

    if (!confirmed) return;

    try {
      await deleteFeed.mutateAsync(id);
    } catch (error) {
      await dialog.alert(`Error: ${error.message}`);
    }
  }

  return {
    handleDelete,
    handleSubmit,
    isCrudPending:
      createFeed.isPending || updateFeed.isPending || deleteFeed.isPending,
  };
}
