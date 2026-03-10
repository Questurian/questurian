import { Link } from 'react-router-dom';

export default function LeadsHeader({ isRefreshing, leadCount }) {
  return (
    <>
      <div className="page-header">
        <h1>Leads</h1>
        <div className="page-actions">
          <Link to="/feeds" className="button secondary">
            Manage Article Feeds
          </Link>
        </div>
        <div className="lead-count">{leadCount} leads found</div>
      </div>

      {isRefreshing && <div className="badge">Refreshing...</div>}
    </>
  );
}
