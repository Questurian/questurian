import { Link } from 'react-router-dom';

export default function InstagramPostsHeader({
  count,
  isRefreshing,
}) {
  return (
    <>
      <div className="page-header">
        <h1>Instagram Posts</h1>
        <div className="page-actions">
          <Link to="/instagram-feeds" className="button secondary">
            Manage Instagram Feeds
          </Link>
        </div>
        <div className="lead-count">{count} posts found</div>
      </div>

      {isRefreshing && <div className="badge">Refreshing...</div>}
    </>
  );
}
