import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  buildSubredditUrl,
  truncateText,
} from '../utils/dashboardFormatters';

export default function SubredditSpotlight({
  categoryNames,
  subredditPicks,
  subredditsError,
  subredditsLoading,
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <section className="subreddit-spotlight card">
      <div className="subreddit-spotlight-header">
        <div>
          <h3>Reddit Quick Picks</h3>
          {!isExpanded && (
            <p className="subreddit-spotlight-subtitle">
              Random picks from your saved subreddits for quick browsing.
            </p>
          )}
        </div>

        <div className="subreddit-spotlight-actions">
          {!isExpanded ? (
            <button
              className="button secondary button-sm"
              onClick={() => setIsExpanded(true)}
            >
              Expand
            </button>
          ) : (
            <>
              <Link className="button secondary button-sm" to="/subreddit-browser">
                Browse All
              </Link>
              <Link className="button button-sm" to="/subreddits">
                Manage
              </Link>
              <button
                className="button secondary button-sm"
                onClick={() => setIsExpanded(false)}
              >
                Collapse
              </button>
            </>
          )}
        </div>
      </div>

      <div className={`subreddit-spotlight-content ${isExpanded ? 'expanded' : 'collapsed'}`}>
        {subredditsLoading && (
          <p className="subreddit-spotlight-empty">Loading subreddit picks...</p>
        )}

        {!subredditsLoading && subredditsError && (
          <p className="error-text">
            Subreddit picks unavailable: {subredditsError.message}
          </p>
        )}

        {!subredditsLoading && !subredditsError && subredditPicks.length === 0 && (
          <p className="subreddit-spotlight-empty">
            No subreddits yet. Add a few to show random picks here.
          </p>
        )}

        {!subredditsLoading && !subredditsError && subredditPicks.length > 0 && (
          <div className="subreddit-grid">
            {subredditPicks.map((subreddit) => (
              <div key={subreddit.id} className="subreddit-card">
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

                  <span className="badge">
                    {categoryNames.get(subreddit.category_id) || 'Unknown'}
                  </span>
                </div>

                <p className="subreddit-description">
                  {truncateText(subreddit.description)}
                </p>

                <div className="subreddit-actions">
                  <span className="subreddit-action-label">Open</span>
                  <a
                    className="subreddit-chip"
                    href={buildSubredditUrl(subreddit.subreddit)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Visit Reddit
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
