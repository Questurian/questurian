import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCategories, useYouTubeFeeds, useYouTubePostsList, useExtractYouTubeTranscript } from '../hooks';
import { youtubePostsApi } from '../api';

export default function YouTubePosts() {
  const [filters, setFilters] = useState({
    search: '',
    category: '',
    youtube_feed_id: '',
  });
  const [transcriptStates, setTranscriptStates] = useState({});

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

  const extractTranscript = useExtractYouTubeTranscript();

  const isLoading = postsLoading || feedsLoading || categoriesLoading;
  const error = postsError || feedsError || categoriesError;

  async function handleExtractTranscript(postId) {
    setTranscriptStates((prev) => ({ ...prev, [postId]: { loading: true } }));
    try {
      const result = await extractTranscript.mutateAsync(postId);
      setTranscriptStates((prev) => ({
        ...prev,
        [postId]: {
          loading: false,
          status: result.transcript_status,
          error: result.transcript_error,
          hasTranscript: !!result.transcript,
        },
      }));
    } catch (err) {
      setTranscriptStates((prev) => ({
        ...prev,
        [postId]: { loading: false, error: err.message },
      }));
    }
  }

  function handleDownloadTranscript(postId) {
    window.open(youtubePostsApi.downloadTranscriptUrl(postId), '_blank');
  }

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
                  {(() => {
                    const state = transcriptStates[post.id];
                    const hasExistingTranscript = post.transcript_status === 'completed';
                    const isUnavailable = post.transcript_status === 'unavailable' || state?.status === 'unavailable';

                    if (state?.loading) {
                      return <span className="badge">Extracting transcript...</span>;
                    }

                    if (hasExistingTranscript || state?.hasTranscript) {
                      return (
                        <button
                          className="button"
                          onClick={() => handleDownloadTranscript(post.id)}
                        >
                          Download CSV
                        </button>
                      );
                    }

                    if (isUnavailable) {
                      return <span className="badge" style={{ background: '#888' }}>No transcript available</span>;
                    }

                    if (state?.error && state?.status === 'failed') {
                      return (
                        <>
                          <span className="badge" style={{ background: '#c00' }}>Failed</span>
                          <button
                            className="button secondary"
                            onClick={() => handleExtractTranscript(post.id)}
                          >
                            Retry
                          </button>
                        </>
                      );
                    }

                    return (
                      <button
                        className="button secondary"
                        onClick={() => handleExtractTranscript(post.id)}
                      >
                        Get Transcript
                      </button>
                    );
                  })()}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
