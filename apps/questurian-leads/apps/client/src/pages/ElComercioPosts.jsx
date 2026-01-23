import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useElComercioFeeds,
  useInfiniteElComercioPostsList,
  useDeleteElComercioPost,
  useFetchAllElComercioFeeds,
} from '../hooks';
import { useDialog } from '../providers/DialogProvider';

const PAGE_SIZE = 30;

export default function ElComercioPosts() {
  const [filters, setFilters] = useState({
    search: '',
    el_comercio_feed_id: '',
    approval_status: 'approved',
  });
  const dialog = useDialog();

  const {
    data,
    isLoading: postsLoading,
    isFetching: postsFetching,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
    error: postsError,
  } = useInfiniteElComercioPostsList(filters, PAGE_SIZE);
  const posts = data?.pages.flat() ?? [];
  const {
    data: feeds = [],
    isLoading: feedsLoading,
    error: feedsError,
  } = useElComercioFeeds();

  const deletePost = useDeleteElComercioPost();
  const fetchAllFeeds = useFetchAllElComercioFeeds();

  const isLoading = postsLoading || feedsLoading;
  const error = postsError || feedsError;
  const isMutating = deletePost.isPending || fetchAllFeeds.isPending;
  const isRefreshing = postsFetching && !postsLoading && !isFetchingNextPage;
  const loadMoreRef = useRef(null);

  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return;
    const node = loadMoreRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          fetchNextPage();
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  async function handleDelete(id) {
    const confirmed = await dialog.confirm('Are you sure you want to delete this article?');
    if (!confirmed) return;
    try {
      await deletePost.mutateAsync(id);
    } catch (err) {
      await dialog.alert(`Error: ${err.message}`);
    }
  }

  async function handleFetchArticles() {
    try {
      const result = await fetchAllFeeds.mutateAsync();
      const successCount = result?.filter(r => r.status === 'SUCCESS').length || 0;
      await dialog.alert(`Scraping complete! Successfully scraped ${successCount} feed(s). Check the approval queue to review new articles.`);
    } catch (err) {
      await dialog.alert(`Error: ${err.message}`);
    }
  }

  function getFeedName(feedId) {
    const feed = feeds.find(f => f.id === feedId);
    return feed ? feed.display_name : 'Unknown';
  }

  function handleFilterChange(key, value) {
    setFilters(prev => ({ ...prev, [key]: value }));
  }

  function clearFilters() {
    setFilters({
      search: '',
      el_comercio_feed_id: '',
      approval_status: 'approved',
    });
  }

  function formatDate(dateString) {
    if (!dateString) return 'Unknown';
    // Handle DD/MM/YYYY format from El Comercio
    const parts = dateString.split('/');
    if (parts.length === 3) {
      const [day, month, year] = parts;
      return `${month}/${day}/${year}`;
    }
    return new Date(dateString).toLocaleDateString();
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>El Comercio Articles</h1>
        <div className="page-actions">
          <button
            className="button primary"
            onClick={handleFetchArticles}
            disabled={isMutating}
          >
            {fetchAllFeeds.isPending ? 'Scraping...' : 'Scrape Articles'}
          </button>
          <Link to="/el-comercio-feeds" className="button secondary">Scraper Info</Link>
        </div>
        <div className="lead-count">{posts.length} approved articles</div>
      </div>

      {isRefreshing && <div className="badge">Refreshing...</div>}

      {error && <div className="error">{error.message}</div>}

      <div className="filters card">
        <h3>Filters</h3>
        <div className="filters-grid">
          <div className="form-group">
            <label>Search</label>
            <input
              type="text"
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              placeholder="Search in titles, excerpts..."
            />
          </div>
          <div className="form-group">
            <label>Feed</label>
            <select
              value={filters.el_comercio_feed_id}
              onChange={(e) => handleFilterChange('el_comercio_feed_id', e.target.value)}
            >
              <option value="">All Feeds</option>
              {feeds.map(feed => (
                <option key={feed.id} value={feed.id}>{feed.display_name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Approval Status</label>
            <select
              value={filters.approval_status}
              onChange={(e) => handleFilterChange('approval_status', e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>
        <button className="button secondary" onClick={clearFilters}>
          Clear Filters
        </button>
      </div>

      {isLoading ? (
        <div className="loading">Loading articles...</div>
      ) : (
        <div className="leads-list">
          {posts.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
              <p>No articles found. Try adjusting your filters or scraping a feed.</p>
              <Link to="/el-comercio-feeds" className="button" style={{ marginTop: '20px' }}>
                Go to Feeds
              </Link>
            </div>
          ) : (
            posts.map((post) => {
              // Show translated title/excerpt when available, otherwise show original
              const displayTitle = post.title_translated || post.title;
              const displayExcerpt = post.excerpt_translated || post.excerpt;

              const isTranslated = post.translation_status === 'translated';
              const approvalBadgeClass =
                post.approval_status === 'approved' ? 'success' :
                post.approval_status === 'rejected' ? 'danger' :
                'warning';

              return (
                <div key={post.id} className="lead-card">
                  <div className="lead-header">
                    <div>
                      <h3>
                        <a href={post.url} target="_blank" rel="noopener noreferrer">
                          {displayTitle}
                        </a>
                        {isTranslated && <span className="badge translation-badge">Translated</span>}
                        {post.detected_language && (
                          <span className="badge language-badge">{post.detected_language}</span>
                        )}
                        <span className={`badge ${approvalBadgeClass}`}>
                          {post.approval_status || 'pending'}
                        </span>
                      </h3>
                      <div className="lead-meta">
                        <span className="badge">{getFeedName(post.el_comercio_feed_id)}</span>
                        <span className="badge secondary">{post.section}</span>
                        <span>Published: {formatDate(post.published_at)}</span>
                      </div>
                    </div>
                    <button className="button-sm danger" onClick={() => handleDelete(post.id)} disabled={isMutating}>
                      Delete
                    </button>
                  </div>

                  {post.image_url && (
                    <div className="lead-image">
                      <img src={post.image_url} alt={displayTitle} />
                    </div>
                  )}

                  {displayExcerpt && (
                    <div className="lead-content">
                      <p>{displayExcerpt}</p>
                    </div>
                  )}

                  <div className="lead-footer">
                    <small>Source: {post.source}</small>
                    <small>Collected: {new Date(post.collected_at).toLocaleString()}</small>
                    {isTranslated && post.translated_at && (
                      <small>Translated: {new Date(post.translated_at).toLocaleString()}</small>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {hasNextPage && (
        <div className="load-more" ref={loadMoreRef}>
          <button
            className="button secondary"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? 'Loading more...' : 'Load more articles'}
          </button>
        </div>
      )}
    </div>
  );
}
