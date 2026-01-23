import {
  useElComercioFeeds,
  useFetchElComercioFeed,
} from '../hooks';
import { useDialog } from '../providers/DialogProvider';

export default function ElComercioFeeds() {
  const dialog = useDialog();
  const {
    data: feeds = [],
    isLoading,
    isFetching,
    error,
  } = useElComercioFeeds();

  const fetchFeed = useFetchElComercioFeed();
  const isMutating = fetchFeed.isPending;

  const hasFeeds = feeds.length > 0;

  async function handleFetch() {
    try {
      const result = await fetchFeed.mutateAsync();
      await dialog.alert(
        `Scraping completed!\n\nStatus: ${result.status}\nArticles collected: ${result.post_count}${result.error_message ? '\n\nErrors:\n' + result.error_message : ''}\n\nThis replaces ALL existing articles with fresh 15 from the archive.`,
      );
    } catch (err) {
      await dialog.alert(`Error: ${err.message}`);
    }
  }

  if (isLoading) return <div className="loading">Loading El Comercio scraper...</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>El Comercio Scraper</h1>
          <p className="page-subtitle">
            Single-source scraper for the Gastronomia archive. No feed setup required.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="button primary" onClick={handleFetch} disabled={isMutating}>
            {fetchFeed.isPending ? 'Scraping...' : 'Scrape Now'}
          </button>
        </div>
        {isFetching && <span className="badge">Refreshing...</span>}
      </div>

      {error && <div className="error">{error.message}</div>}

      {hasFeeds ? (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Display Name</th>
                <th>Section</th>
                <th>URL</th>
                <th>Last Scraped</th>
              </tr>
            </thead>
            <tbody>
              {feeds.map((feed) => (
                <tr key={feed.id}>
                  <td>{feed.id}</td>
                  <td>{feed.display_name}</td>
                  <td>
                    <span className="badge">{feed.section}</span>
                  </td>
                  <td>
                    <a href={feed.url} target="_blank" rel="noopener noreferrer" className="link">
                      Archive Link ↗
                    </a>
                  </td>
                  <td>{feed.last_fetched ? new Date(feed.last_fetched).toLocaleString() : 'Never'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
          <p>No feed record yet. Click "Scrape Now" to initialize and fetch articles.</p>
        </div>
      )}

      <div className="info-box" style={{ marginTop: '20px' }}>
        <h4>About El Comercio Scraping</h4>
        <ul>
          <li>Each scrape fetches the <strong>latest 15 articles</strong> from the archive</li>
          <li>Scraping takes approximately <strong>20-30 seconds</strong></li>
          <li>All articles are <strong>auto-translated</strong> from Spanish to English</li>
          <li>Articles default to <strong>"pending" approval status</strong></li>
          <li>Each scrape <strong>replaces all existing articles</strong> with fresh data</li>
        </ul>
      </div>
    </div>
  );
}
