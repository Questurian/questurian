import {
  useElComercioCurrentScrapeJob,
  useDeleteElComercioPost,
  useFetchAllElComercioFeeds,
} from '../../../../hooks';
import { useDialog } from '../../../../providers/DialogProvider';

export function useElComercioPostsActions() {
  const dialog = useDialog();
  const deletePost = useDeleteElComercioPost();
  const fetchAllFeeds = useFetchAllElComercioFeeds();
  const { data: currentJob } = useElComercioCurrentScrapeJob();

  async function handleDelete(id) {
    const confirmed = await dialog.confirm(
      'Are you sure you want to delete this article?',
    );

    if (!confirmed) return;

    try {
      await deletePost.mutateAsync(id);
    } catch (error) {
      await dialog.alert(`Error: ${error.message}`);
    }
  }

  async function handleFetchArticles() {
    try {
      const result = await fetchAllFeeds.mutateAsync();
      const job = Array.isArray(result) ? result[0] : result;
      await dialog.alert(
        `El Comercio scrape queued.\n\nJob #${job?.id} is ${job?.status || 'queued'}. Check Scraper Info for progress.`,
      );
    } catch (error) {
      await dialog.alert(`Error: ${error.message}`);
    }
  }

  const scrapePending = fetchAllFeeds.isPending || ['queued', 'running'].includes(currentJob?.status);

  return {
    handleDelete,
    handleFetchArticles,
    isMutating: deletePost.isPending || scrapePending,
    scrapePending,
    scrapeStatusLabel: currentJob?.status === 'running' ? 'Scrape Running' : 'Scrape Queued',
  };
}
