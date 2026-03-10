import { Link } from 'react-router-dom';

export default function ElComercioPostsHeader({
  count,
  isMutating,
  isRefreshing,
  onScrape,
  scrapePending,
  scrapeStatusLabel,
}) {
  return (
    <>
      <div className="page-header">
        <h1>El Comercio Articles</h1>
        <div className="page-actions">
          <button className="button primary" onClick={onScrape} disabled={isMutating}>
            {scrapePending ? (scrapeStatusLabel || 'Scrape Queued') : 'Queue Scrape'}
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
