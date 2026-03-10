import { useDeleteInstagramPost } from '../../../../hooks';
import { useDialog } from '../../../../providers/DialogProvider';

export function useInstagramPostsActions() {
  const dialog = useDialog();
  const deletePost = useDeleteInstagramPost();

  async function handleDelete(id) {
    const confirmed = await dialog.confirm(
      'Are you sure you want to delete this Instagram post?',
    );

    if (!confirmed) return;

    try {
      await deletePost.mutateAsync(id);
    } catch (error) {
      await dialog.alert(`Error: ${error.message}`);
    }
  }

  return {
    handleDelete,
    isMutating: deletePost.isPending,
  };
}
