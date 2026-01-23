import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { devApi } from '../api';
import { useDialog } from '../providers/DialogProvider';

export default function Settings() {
  const queryClient = useQueryClient();
  const dialog = useDialog();
  const clearFetchedMutation = useMutation({
    mutationFn: () => devApi.clearFetched(),
    onSuccess: (result) => {
      dialog.alert(result.message);
    },
    onSettled: () => {
      queryClient.invalidateQueries();
    },
  });

  const clearAllMutation = useMutation({
    mutationFn: () => devApi.clearAll(),
    onSuccess: (result) => {
      dialog.alert(result.message);
    },
    onSettled: () => {
      queryClient.invalidateQueries();
    },
  });

  const isMutating = clearFetchedMutation.isPending || clearAllMutation.isPending;

  async function handleClearFetched() {
    const confirmed = await dialog.confirm(
      'Clear all fetched content and logs (articles, Instagram, YouTube, Telegram, El Comercio, Diario Correo)? This will keep categories, countries, feeds, tags, and feed mappings.',
    );
    if (!confirmed) {
      return;
    }
    try {
      await clearFetchedMutation.mutateAsync();
    } catch (error) {
      await dialog.alert(`Error: ${error.message}`);
    }
  }

  async function handleClearAll() {
    const confirmed = await dialog.confirm(
      'WARNING: Clear ALL data including categories, countries, feeds, tags, subreddits, posts, and logs across articles, Instagram, YouTube, Telegram, El Comercio, and Diario Correo? This cannot be undone!',
    );
    if (!confirmed) {
      return;
    }
    try {
      await clearAllMutation.mutateAsync();
    } catch (error) {
      await dialog.alert(`Error: ${error.message}`);
    }
  }

  return (
    <div className="dashboard">
      <h1>Settings</h1>
      <div className="manage-grid">
        <div className="manage-section">
          <h2>Content Management</h2>
          <div className="manage-grid">
            <div className="manage-card">
              <div>
                <h3>Tags</h3>
                <p>Create tags and organize feeds, posts, and leads.</p>
              </div>
              <div className="manage-actions">
                <Link className="button button-sm" to="/tags">Manage Tags</Link>
              </div>
            </div>
            <div className="manage-card">
              <div>
                <h3>Categories</h3>
                <p>Define categories used across feeds and posts.</p>
              </div>
              <div className="manage-actions">
                <Link className="button button-sm" to="/categories">Manage Categories</Link>
              </div>
            </div>
            <div className="manage-card">
              <div>
                <h3>Countries</h3>
                <p>Maintain the list of countries used for feed targeting.</p>
              </div>
              <div className="manage-actions">
                <Link className="button button-sm" to="/countries">Manage Countries</Link>
              </div>
            </div>
          </div>
        </div>

        <div className="manage-section">
          <h2>Social Media</h2>
          <div className="manage-grid">
            <div className="manage-card">
              <div>
                <h3>Instagram Posts</h3>
                <p>Browse fetched Instagram posts and filter by tags.</p>
              </div>
              <div className="manage-actions">
                <Link className="button button-sm" to="/instagram-posts">View Posts</Link>
              </div>
            </div>
            <div className="manage-card">
              <div>
                <h3>YouTube Posts</h3>
                <p>Browse fetched YouTube posts and review metadata.</p>
              </div>
              <div className="manage-actions">
                <Link className="button button-sm" to="/youtube-posts">View Posts</Link>
              </div>
            </div>
          </div>
        </div>

        <div className="manage-section">
          <h2>Articles</h2>
          <div className="manage-grid">
            <div className="manage-card">
              <div>
                <h3>Feeds</h3>
                <p>Manage all source feeds, status, and schedules.</p>
              </div>
              <div className="manage-actions">
                <Link className="button button-sm" to="/feeds">Manage Feeds</Link>
                <Link className="button button-sm secondary" to="/feeds?active=1">Active Feeds</Link>
              </div>
            </div>
            <div className="manage-card">
              <div>
                <h3>Scrapes</h3>
                <p>Monitor scraping jobs and manage crawl settings.</p>
              </div>
              <div className="manage-actions">
                <Link className="button button-sm" to="/scrapes/manage">Manage Scrapes</Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="dev-tools card">
        <h2>Development Tools</h2>
        <p className="dev-warning">Use these tools carefully - they will delete data!</p>
        <div className="dev-actions">
          <button className="button-sm warning" onClick={handleClearFetched} disabled={isMutating}>
            Clear Fetched Data (Posts & Logs)
          </button>
          <button className="button-sm danger" onClick={handleClearAll} disabled={isMutating}>
            Clear All Data
          </button>
        </div>
      </div>
    </div>
  );
}
