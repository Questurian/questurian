import { useState } from 'react';
import { Link } from 'react-router-dom';
import { instagramPostImageUrl } from '../api';
import {
  useCategories,
  useInstagramFeeds,
  useInstagramPostsList,
  useTags,
  useDeleteInstagramPost,
} from '../hooks';
import { useDialog } from '../providers/DialogProvider';

export default function InstagramPosts() {
  const [filters, setFilters] = useState({
    search: '',
    category: '',
    tag: '',
    instagram_feed_id: '',
  });
  const dialog = useDialog();

  const {
    data: posts = [],
    isLoading: postsLoading,
    isFetching: postsFetching,
    error: postsError,
  } = useInstagramPostsList(filters);
  const {
    data: feeds = [],
    isLoading: feedsLoading,
    error: feedsError,
  } = useInstagramFeeds();
  const {
    data: categories = [],
    isLoading: categoriesLoading,
    error: categoriesError,
  } = useCategories();
  const {
    data: tags = [],
    isLoading: tagsLoading,
    error: tagsError,
  } = useTags();

  const deletePost = useDeleteInstagramPost();

  const isLoading = postsLoading || feedsLoading || categoriesLoading || tagsLoading;
  const error = postsError || feedsError || categoriesError || tagsError;
  const isMutating = deletePost.isPending;

  async function handleDelete(id) {
    const confirmed = await dialog.confirm('Are you sure you want to delete this Instagram post?');
    if (!confirmed) return;
    try {
      await deletePost.mutateAsync(id);
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
      category: '',
      tag: '',
      instagram_feed_id: '',
    });
  }

  function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num;
  }


  return (
    <div className="page">
      <div className="page-header">
        <h1>Instagram Posts</h1>
        <div className="page-actions">
          <Link to="/instagram-feeds" className="button secondary">Manage Instagram Feeds</Link>
        </div>
        <div className="lead-count">{posts.length} posts found</div>
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
              placeholder="Search in captions, usernames..."
            />
          </div>
          <div className="form-group">
            <label>Category</label>
            <select
              value={filters.category}
              onChange={(e) => handleFilterChange('category', e.target.value)}
            >
              <option value="">All Categories</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.name}>{cat.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Tag</label>
            <select
              value={filters.tag}
              onChange={(e) => handleFilterChange('tag', e.target.value)}
            >
              <option value="">All Tags</option>
              {tags.map(tag => (
                <option key={tag.id} value={tag.name}>{tag.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Instagram Feed</label>
            <select
              value={filters.instagram_feed_id}
              onChange={(e) => handleFilterChange('instagram_feed_id', e.target.value)}
            >
              <option value="">All Feeds</option>
              {feeds.map(feed => (
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
        <div className="loading">Loading Instagram posts...</div>
      ) : (
        <div className="leads-list">
          {posts.map((post) => {
            // Show translated caption when available, otherwise show original
            const displayCaption = post.caption_translated || post.caption;

            const isTranslated = post.translation_status === 'translated';
            const mediaUrl = post.media_url || post.thumbnail_url;
            const showVideo = post.media_type === 'video' && post.media_url;
            const imageUrl = mediaUrl ? instagramPostImageUrl(post.id) : null;
            const posterUrl = post.thumbnail_url ? instagramPostImageUrl(post.id) : null;

            return (
              <div key={post.id} className="lead-card instagram-post-card">
                <div className="lead-header">
                  <div>
                    <h3>
                      <a href={post.permalink} target="_blank" rel="noopener noreferrer">
                        @{post.username}
                      </a>
                      {isTranslated && <span className="badge translation-badge">Translated</span>}
                      {post.detected_language && post.detected_language !== 'en' && (
                        <span className="badge language-badge">{post.detected_language}</span>
                      )}
                    </h3>
                    <span className="badge">{getFeedName(post.instagram_feed_id)}</span>
                  </div>
                  <button className="button-sm danger" onClick={() => handleDelete(post.id)} disabled={isMutating}>
                    Delete
                  </button>
                </div>

                <div className="instagram-content">
                  {imageUrl && (
                    <div className="instagram-media">
                      {showVideo ? (
                        <video controls poster={posterUrl || undefined}>
                          <source src={post.media_url} type="video/mp4" />
                        </video>
                      ) : (
                        <img src={imageUrl} alt="Instagram post" />
                      )}
                    </div>
                  )}

                  <div className="instagram-caption-section">
                    {displayCaption && (
                      <p className="instagram-caption">{displayCaption}</p>
                    )}

                    <div className="instagram-stats">
                      <span>{formatNumber(post.like_count)} likes</span>
                      <span>{formatNumber(post.comment_count)} comments</span>
                      {post.view_count && <span>{formatNumber(post.view_count)} views</span>}
                      {post.media_type && <span className="media-type-badge">{post.media_type}</span>}
                    </div>
                  </div>
                </div>

              <div className="lead-footer">
                <small>Posted: {post.posted_at ? new Date(post.posted_at).toLocaleDateString() : 'Unknown'}</small>
                <small>Collected: {new Date(post.collected_at).toLocaleString()}</small>
              </div>
            </div>
            );
          })}
        </div>
      )}

      {posts.length === 0 && !isLoading && (
        <div className="empty-state">
          <p>No Instagram posts found. Try adjusting your filters or fetch some Instagram feeds!</p>
        </div>
      )}
    </div>
  );
}
