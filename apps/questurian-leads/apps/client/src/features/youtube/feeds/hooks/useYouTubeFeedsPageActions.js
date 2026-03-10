import { useState } from 'react';
import {
  useCreateYouTubeFeed,
  useDeleteYouTubeFeed,
  useFetchAllYouTubeFeeds,
  useFetchYouTubeFeed,
  useUpdateYouTubeFeed,
} from '../../../../hooks';
import { useDialog } from '../../../../providers/DialogProvider';
import { DEFAULT_YOUTUBE_FETCH_RESULTS } from '../constants/youtubeFeeds.constants';
import {
  formatYouTubeFetchAllSummary,
  getSafeYouTubeMaxResults,
} from '../utils/youtubeFeedPresentation';

export function useYouTubeFeedsPageActions({
  editingId,
  formData,
  onCancel,
}) {
  const [maxResults, setMaxResults] = useState(DEFAULT_YOUTUBE_FETCH_RESULTS);
  const dialog = useDialog();
  const createFeed = useCreateYouTubeFeed();
  const updateFeed = useUpdateYouTubeFeed();
  const deleteFeed = useDeleteYouTubeFeed();
  const fetchFeed = useFetchYouTubeFeed();
  const fetchAllFeeds = useFetchAllYouTubeFeeds();

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
      'Are you sure you want to delete this YouTube feed?',
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
      const result = await fetchFeed.mutateAsync({
        feedId,
        maxResults: getSafeYouTubeMaxResults(maxResults),
      });

      await dialog.alert(
        `Fetch completed!\nStatus: ${result.status}\nVideos collected: ${result.post_count}${result.error_message ? `\nErrors: ${result.error_message}` : ''}`,
      );
    } catch (error) {
      await dialog.alert(`Error: ${error.message}`);
    }
  }

  async function handleFetchAll() {
    const confirmed = await dialog.confirm(
      'Fetch all active YouTube feeds? This may take a while.',
    );

    if (!confirmed) return;

    try {
      const results = await fetchAllFeeds.mutateAsync(
        getSafeYouTubeMaxResults(maxResults),
      );
      await dialog.alert(
        `Fetched ${results.length} YouTube feeds:\n${formatYouTubeFetchAllSummary(results)}`,
      );
    } catch (error) {
      await dialog.alert(`Error: ${error.message}`);
    }
  }

  return {
    fetchAllPending: fetchAllFeeds.isPending,
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
    maxResults,
    setMaxResults,
  };
}
