import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCategories, useYouTubeFeeds, useYouTubePostsList } from '../hooks';

export default function YouTubePosts() {
  const [filters, setFilters] = useState({
    search: '',
    category: '',
    youtube_feed_id: '',
    video_type: '', // 'short', 'video', or '' for all
  });

  const {
    data: posts = [],
    isLoading: postsLoading,
    isFetching: postsFetching,
    error: postsError,
  } = useYouTubePostsList(filters);
  const {
    data: feeds = [],
    isLoading: feedsLoading,
    error: feedsError,
  } = useYouTubeFeeds();
  const {
    data: categories = [],
    isLoading: categoriesLoading,
    error: categoriesError,
  } = useCategories();

  const isLoading = postsLoading || feedsLoading || categoriesLoading;
  const error = postsError || feedsError || categoriesError;

  function getFeedName(feedId) {
    const feed = feeds.find((item) => item.id === feedId);
    return feed ? feed.display_name : 'Unknown Channel';
  }

  function handleFilterChange(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function clearFilters() {
    setFilters({
      search: '',
      category: '',
      youtube_feed_id: '',
      video_type: '',
    });
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>YouTube Videos</h1>
        <div className="page-actions">
          <Link to="/youtube-feeds" className="button secondary">Manage YouTube Feeds</Link>
        </div>
        <div className="lead-count">{posts.length} videos found</div>
      </div>

      {postsFetching && !postsLoading && <div className="badge">Refreshing...</div>}

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
              placeholder="Search titles and descriptions..."
            />
          </div>
          <div className="form-group">
            <label>Category</label>
            <select
              value={filters.category}
              onChange={(e) => handleFilterChange('category', e.target.value)}
            >
              <option value="">All Categories</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.name}>{cat.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>YouTube Feed</label>
            <select
              value={filters.youtube_feed_id}
              onChange={(e) => handleFilterChange('youtube_feed_id', e.target.value)}
            >
              <option value="">All Feeds</option>
              {feeds.map((feed) => (
                <option key={feed.id} value={feed.id}>{feed.display_name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Video Type</label>
            <select
              value={filters.video_type}
              onChange={(e) => handleFilterChange('video_type', e.target.value)}
            >
              <option value="">All Videos</option>
              <option value="video">Regular Videos</option>
              <option value="short">Shorts Only</option>
            </select>
          </div>
        </div>
        <button className="button secondary" onClick={clearFilters}>
          Clear Filters
        </button>
      </div>

      {isLoading ? (
        <div className="loading">Loading YouTube videos...</div>
      ) : (
        <div className="leads-list">
          {posts.map((post) => {
            const feedLabel = getFeedName(post.youtube_feed_id);
            const publishedLabel = post.published_at
              ? new Date(post.published_at).toLocaleDateString()
              : 'Unknown';
            return (
              <div key={post.id} className="lead-card">
                {post.thumbnail_url && (
                  <div className="lead-image">
                    <img src={post.thumbnail_url} alt={post.title} loading="lazy" />
                  </div>
                )}
                <div className="lead-header">
                  <h3>
                    {post.video_url ? (
                      <a href={post.video_url} target="_blank" rel="noopener noreferrer">
                        {post.title}
                      </a>
                    ) : (
                      post.title
                    )}
                  </h3>
                </div>

                <div className="lead-badges">
                  <span className="badge">YouTube</span>
                  {post.is_short === 1 && (
                    <span className="badge" style={{ background: '#ff0050' }}>Short</span>
                  )}
                  <span className="badge">{feedLabel}</span>
                </div>

                <div className="lead-meta">
                  <span>Published: {publishedLabel}</span>
                </div>

                {post.description && <p className="lead-summary">{post.description}</p>}

                <div className="lead-footer">
                  <small>Collected: {new Date(post.collected_at).toLocaleString()}</small>
                </div>

                <div className="transcript-actions" style={{ marginTop: '12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {post.video_url ? (
                    <a
                      className="button secondary"
                      href={post.video_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open in YouTube
                    </a>
                  ) : (
                    <span className="badge" style={{ background: '#888' }}>No YouTube URL</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
