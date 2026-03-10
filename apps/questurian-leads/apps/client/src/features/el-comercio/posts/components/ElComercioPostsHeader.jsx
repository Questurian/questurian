import { Link } from 'react-router-dom';

export default function ElComercioPostsHeader({
  count,
  isMutating,
  isRefreshing,
  onScrape,
  scrapePending,
}) {
  return (
    <>
      <div className="page-header">
        <h1>El Comercio Articles</h1>
        <div className="page-actions">
          <button className="button primary" onClick={onScrape} disabled={isMutating}>
            {scrapePending ? 'Scraping...' : 'Scrape Articles'}
          </button>
          <Link to="/scrapes/manage" className="button secondary">
            Scraper Info
          </Link>
        </div>
        <div className="lead-count">{count} approved articles</div>
      </div>

      {isRefreshing && <div className="badge">Refreshing...</div>}
    </>
  );
}
