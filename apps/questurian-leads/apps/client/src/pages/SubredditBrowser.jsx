import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useCategories, useSubreddits } from '../hooks';

const browseOptions = [
  { label: 'Hot', sort: 'hot' },
  { label: 'New', sort: 'new' },
  { label: 'Rising', sort: 'rising' },
  { label: 'Controversial', sort: 'controversial' },
];

const bestOptions = [
  { label: 'Best Day', sort: 'top', time: 'day' },
  { label: 'Best Week', sort: 'top', time: 'week' },
  { label: 'Best Month', sort: 'top', time: 'month' },
  { label: 'Best Year', sort: 'top', time: 'year' },
  { label: 'Best All', sort: 'top', time: 'all' },
];

export default function SubredditBrowser() {
  const {
    data: subreddits = [],
    isLoading: subredditsLoading,
    isFetching: subredditsFetching,
    error: subredditsError,
  } = useSubreddits();
  const {
    data: categories = [],
    isLoading: categoriesLoading,
    error: categoriesError,
  } = useCategories();

  const isLoading = subredditsLoading || categoriesLoading;
  const error = subredditsError || categoriesError;

  const sortedSubreddits = useMemo(() => {
    return [...subreddits].sort((a, b) => {
      const left = a.display_name || a.subreddit;
      const right = b.display_name || b.subreddit;
      return left.localeCompare(right);
    });
  }, [subreddits]);

  function getCategoryName(categoryId) {
    const category = categories.find((c) => c.id === categoryId);
    return category ? category.name : 'Unknown';
  }

  function buildSubredditUrl(name, sort, time) {
    const base = `https://www.reddit.com/r/${name}/`;
    if (!sort || sort === 'hot') return base;
    if (sort === 'top') return `${base}top/?t=${time}`;
    return `${base}${sort}/`;
  }

  function truncateText(text, maxLength = 120) {
    if (!text) return 'No description yet.';
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength)}...`;
  }

  if (isLoading) return <div className="loading">Loading subreddit browser...</div>;

  return (
    <div className="page subreddit-directory">
      <div className="page-header">
        <div>
          <h1>Subreddit Browser</h1>
          <p className="page-subtitle">
            Open each subreddit with quick filters for what is new or best.
          </p>
        </div>
        <Link className="button secondary" to="/subreddits">
          Manage Subreddits
        </Link>
      </div>

      {subredditsFetching && <div className="badge">Refreshing...</div>}

      {error && <div className="error">{error.message}</div>}

      <div className="subreddit-grid">
        {sortedSubreddits.map((subreddit) => (
          <div key={subreddit.id} className="card subreddit-card">
            <div className="subreddit-card-header">
              <div>
                <div className="subreddit-title">
                  {subreddit.display_name || `r/${subreddit.subreddit}`}
                </div>
                <a
                  className="subreddit-link"
                  href={buildSubredditUrl(subreddit.subreddit)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  r/{subreddit.subreddit}
                </a>
              </div>
              <span className="badge">{getCategoryName(subreddit.category_id)}</span>
            </div>
            <p className="subreddit-description">
              {truncateText(subreddit.description)}
            </p>
            <div className="subreddit-actions">
              <span className="subreddit-action-label">Browse</span>
              {browseOptions.map((option) => (
                <a
                  key={`${subreddit.id}-${option.label}`}
                  className="subreddit-chip"
                  href={buildSubredditUrl(subreddit.subreddit, option.sort)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {option.label}
                </a>
              ))}
            </div>
            <div className="subreddit-actions">
              <span className="subreddit-action-label">Best Of</span>
              {bestOptions.map((option) => (
                <a
                  key={`${subreddit.id}-${option.label}`}
                  className="subreddit-chip"
                  href={buildSubredditUrl(subreddit.subreddit, option.sort, option.time)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {option.label}
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>

      {sortedSubreddits.length === 0 && !isLoading && (
        <div className="empty-state">
          <p>No subreddits yet. Add some in the manager to get started.</p>
        </div>
      )}
    </div>
  );
}
