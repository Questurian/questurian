import {
  useDeleteElComercioPost,
  useFetchAllElComercioFeeds,
} from '../../../../hooks';
import { useDialog } from '../../../../providers/DialogProvider';

export function useElComercioPostsActions() {
  const dialog = useDialog();
  const deletePost = useDeleteElComercioPost();
  const fetchAllFeeds = useFetchAllElComercioFeeds();

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
      const successCount = result?.filter((item) => item.status === 'SUCCESS').length || 0;
      await dialog.alert(
        `Scraping complete! Successfully scraped ${successCount} feed(s). Check the approval queue to review new articles.`,
      );
    } catch (error) {
      await dialog.alert(`Error: ${error.message}`);
    }
  }

  return {
    handleDelete,
    handleFetchArticles,
    isMutating: deletePost.isPending || fetchAllFeeds.isPending,
    scrapePending: fetchAllFeeds.isPending,
  };
}
