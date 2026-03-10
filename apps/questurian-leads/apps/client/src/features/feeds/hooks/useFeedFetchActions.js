import {
  useFetchAllFeeds,
  useFetchFeed,
} from '../../../hooks';
import { useDialog } from '../../../providers/DialogProvider';
import { formatFetchAllSummary, getFeedName } from '../utils/feedPresentation';
import {
  buildFeedFetchAllStatusMessage,
  buildFeedFetchCompletedMessage,
  buildFeedFetchStatusMessage,
} from '../utils/feedActionMessages';

export function useFeedFetchActions({
  feeds,
  fetchStatusState,
}) {
  const dialog = useDialog();
  const fetchFeed = useFetchFeed();
  const fetchAllFeeds = useFetchAllFeeds();

  async function handleFetch(feedId) {
    const feedName = getFeedName(feeds, feedId);

    fetchStatusState.setActiveFetchId(feedId);
    fetchStatusState.updateFetchStatus('warning', `Fetching ${feedName}...`);

    try {
      const result = await fetchFeed.mutateAsync(feedId);
      const hasErrors = result.status === 'FAILED';
      const tone = hasErrors ? 'warning' : 'success';

      fetchStatusState.updateFetchStatus(
        tone,
        buildFeedFetchStatusMessage(feedName, hasErrors),
      );

      await dialog.alert(buildFeedFetchCompletedMessage(result), {
        title: hasErrors ? 'Fetch completed with errors' : 'Fetch completed',
        tone,
      });
    } catch (error) {
      fetchStatusState.updateFetchStatus('danger', `${feedName} fetch failed.`);
      await dialog.alert(`Error: ${error.message}`, {
        title: 'Fetch failed',
        tone: 'danger',
      });
    } finally {
      fetchStatusState.setActiveFetchId(null);
    }
  }

  async function handleFetchAll() {
    const confirmed = await dialog.confirm(
      'Fetch all active feeds? This may take a while.',
    );

    if (!confirmed) return;

    fetchStatusState.updateFetchStatus('warning', 'Fetching all active feeds...');

    try {
      const results = await fetchAllFeeds.mutateAsync();
      const status = buildFeedFetchAllStatusMessage(results);

      fetchStatusState.updateFetchStatus(status.tone, status.message);

      await dialog.alert(
        `Fetched ${results.length} feeds:\n${formatFetchAllSummary(results)}`,
        {
          title:
            status.tone === 'warning'
              ? 'Fetch completed with errors'
              : 'Fetch completed',
          tone: status.tone,
        },
      );
    } catch (error) {
      fetchStatusState.updateFetchStatus('danger', 'Fetch all feeds failed.');
      await dialog.alert(`Error: ${error.message}`, {
        title: 'Fetch failed',
        tone: 'danger',
      });
    }
  }

  return {
    fetchAllPending: fetchAllFeeds.isPending,
    fetchPending: fetchFeed.isPending,
    handleFetch,
    handleFetchAll,
  };
}
