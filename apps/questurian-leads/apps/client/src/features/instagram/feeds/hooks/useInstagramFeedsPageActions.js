import {
  useCreateInstagramFeed,
  useDeleteInstagramFeed,
  useFetchAllInstagramFeeds,
  useFetchInstagramFeed,
  useUpdateInstagramFeed,
} from '../../../../hooks';
import { useDialog } from '../../../../providers/DialogProvider';
import { formatInstagramFetchAllSummary } from '../utils/instagramFeedPresentation';

export function useInstagramFeedsPageActions({
  editingId,
  formData,
  onCancel,
}) {
  const dialog = useDialog();
  const createFeed = useCreateInstagramFeed();
  const updateFeed = useUpdateInstagramFeed();
  const deleteFeed = useDeleteInstagramFeed();
  const fetchFeed = useFetchInstagramFeed();
  const fetchAllFeeds = useFetchAllInstagramFeeds();

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
      'Are you sure you want to delete this Instagram feed?',
    );

    if (!confirmed) return;

    try {
      await deleteFeed.mutateAsync(id);
    } catch (error) {
      await dialog.alert(`Error: ${error.message}`);
    }
  }

  async function handleFetch(feedId) {
    try {
      const result = await fetchFeed.mutateAsync(feedId);
      await dialog.alert(
        `Fetch completed!\nStatus: ${result.status}\nPosts collected: ${result.post_count}${result.error_message ? `\nErrors: ${result.error_message}` : ''}`,
      );
    } catch (error) {
      await dialog.alert(`Error: ${error.message}`);
    }
  }

  async function handleFetchAll() {
    const confirmed = await dialog.confirm(
      'Fetch all active Instagram feeds? This may take a while.',
    );

    if (!confirmed) return;

    try {
      const results = await fetchAllFeeds.mutateAsync();
      await dialog.alert(
        `Fetched ${results.length} Instagram feeds:\n${formatInstagramFetchAllSummary(results)}`,
      );
    } catch (error) {
      await dialog.alert(`Error: ${error.message}`);
    }
  }

  return {
    handleDelete,
    handleFetch,
    handleFetchAll,
    handleSubmit,
    isMutating:
      createFeed.isPending ||
      updateFeed.isPending ||
      deleteFeed.isPending ||
      fetchFeed.isPending ||
      fetchAllFeeds.isPending,
  };
}
