import {
  useCreateSubreddit,
  useDeleteSubreddit,
  useUpdateSubreddit,
} from '../../../hooks';
import { useDialog } from '../../../providers/DialogProvider';

export function useSubredditsPageActions({
  editingId,
  formData,
  onCancel,
}) {
  const dialog = useDialog();
  const createSubreddit = useCreateSubreddit();
  const updateSubreddit = useUpdateSubreddit();
  const deleteSubreddit = useDeleteSubreddit();

  async function handleSubmit(event) {
    event.preventDefault();

    try {
      if (editingId) {
        await updateSubreddit.mutateAsync({ id: editingId, data: formData });
      } else {
        await createSubreddit.mutateAsync(formData);
      }

      onCancel();
    } catch (error) {
      await dialog.alert(`Error: ${error.message}`);
    }
  }

  async function handleDelete(id) {
    const confirmed = await dialog.confirm(
      'Are you sure you want to delete this subreddit?',
    );

    if (!confirmed) return;

    try {
      await deleteSubreddit.mutateAsync(id);
    } catch (error) {
      await dialog.alert(`Error: ${error.message}`);
    }
  }

  return {
    handleDelete,
    handleSubmit,
    isMutating:
      createSubreddit.isPending ||
      updateSubreddit.isPending ||
      deleteSubreddit.isPending,
  };
}
