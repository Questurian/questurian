import { useLocation } from 'react-router-dom';
import { API_BASE } from '../api';

const TABLE_LABELS = {
  batch_fetch_jobs: 'batch fetch jobs',
  categories: 'categories',
  countries: 'countries',
  diario_correo_feeds: 'Diario Correo source',
  diario_correo_posts: 'Diario Correo articles',
  el_comercio_feeds: 'El Comercio source',
  el_comercio_posts: 'El Comercio articles',
  feed_tags: 'tags',
  feeds: 'RSS feeds',
  fetch_logs: 'fetch logs',
  instagram_feeds: 'Instagram feeds',
  instagram_posts: 'Instagram posts',
  leads: 'RSS leads',
  reddit_feeds: 'subreddit sources',
  reddit_posts: 'Reddit posts',
  youtube_feeds: 'YouTube feeds',
  youtube_posts: 'YouTube videos',
};

const ROUTE_PROFILES = [
  {
    match: '/',
    pageLabel: 'dashboard',
    needs: [
      { key: 'feeds', label: 'Configured sources' },
      { key: 'leads', label: 'Collected content' },
      { key: 'batch_fetch_jobs', label: 'Fetch job history' },
    ],
  },
  {
    match: '/approval',
    pageLabel: 'approval queue',
    needs: [
      { key: 'leads', label: 'RSS leads' },
      { key: 'instagram_posts', label: 'Instagram posts' },
      { key: 'youtube_posts', label: 'YouTube videos' },
      { key: 'el_comercio_posts', label: 'El Comercio articles' },
      { key: 'diario_correo_posts', label: 'Diario Correo articles' },
    ],
  },
  {
    match: '/batch-fetch',
    pageLabel: 'daily fetch',
    needs: [
      { key: 'batch_fetch_jobs', label: 'Fetch jobs' },
      { key: 'feeds', label: 'Configured sources' },
      { key: 'instagram_feeds', label: 'Instagram feeds' },
      { key: 'youtube_feeds', label: 'YouTube feeds' },
    ],
  },
  {
    match: '/categories',
    pageLabel: 'categories',
    needs: [{ key: 'categories', label: 'Categories' }],
  },
  {
    match: '/countries',
    pageLabel: 'countries',
    needs: [{ key: 'countries', label: 'Countries' }],
  },
  {
    match: '/el-comercio-feeds',
    pageLabel: 'El Comercio source',
    needs: [
      { key: 'categories', label: 'Categories' },
      { key: 'el_comercio_feeds', label: 'El Comercio scraper source' },
    ],
  },
  {
    match: '/feeds',
    pageLabel: 'feeds',
    needs: [
      { key: 'categories', label: 'Categories' },
      { key: 'countries', label: 'Countries' },
      { key: 'feeds', label: 'RSS feeds' },
    ],
  },
  {
    match: '/instagram-feeds',
    pageLabel: 'Instagram feeds',
    needs: [
      { key: 'categories', label: 'Categories' },
      { key: 'countries', label: 'Countries' },
      { key: 'instagram_feeds', label: 'Instagram feeds' },
    ],
  },
  {
    match: '/instagram-posts',
    pageLabel: 'Instagram posts',
    needs: [
      { key: 'instagram_feeds', label: 'Instagram feeds' },
      { key: 'instagram_posts', label: 'Fetched Instagram posts' },
    ],
  },
  {
    match: '/leads',
    pageLabel: 'leads',
    needs: [
      { key: 'feeds', label: 'RSS feeds' },
      { key: 'categories', label: 'Categories' },
      { key: 'leads', label: 'Collected leads' },
    ],
  },
  {
    match: '/logs',
    pageLabel: 'fetch logs',
    needs: [
      { key: 'feeds', label: 'RSS feeds' },
      { key: 'fetch_logs', label: 'Fetch logs' },
    ],
  },
  {
    match: '/scrapes/manage',
    pageLabel: 'scrape manager',
    needs: [
      { key: 'el_comercio_feeds', label: 'El Comercio source' },
      { key: 'diario_correo_feeds', label: 'Diario Correo source' },
    ],
  },
  {
    match: '/subreddit-browser',
    pageLabel: 'subreddit browser',
    needs: [{ key: 'reddit_feeds', label: 'Subreddit sources' }],
  },
  {
    match: '/subreddits',
    pageLabel: 'subreddits',
    needs: [
      { key: 'categories', label: 'Categories' },
      { key: 'reddit_feeds', label: 'Subreddit sources' },
    ],
  },
  {
    match: '/tags',
    pageLabel: 'tags',
    needs: [{ key: 'feed_tags', label: 'Tags' }],
  },
  {
    match: '/youtube-feeds',
    pageLabel: 'YouTube feeds',
    needs: [
      { key: 'categories', label: 'Categories' },
      { key: 'countries', label: 'Countries' },
      { key: 'youtube_feeds', label: 'YouTube feeds' },
    ],
  },
  {
    match: '/youtube-posts',
    pageLabel: 'YouTube videos',
    needs: [
      { key: 'youtube_feeds', label: 'YouTube feeds' },
      { key: 'youtube_posts', label: 'Fetched YouTube videos' },
    ],
  },
];

function getRouteProfile(pathname) {
  return (
    ROUTE_PROFILES.find((profile) => profile.match === pathname) || {
      pageLabel: 'this page',
      needs: [],
    }
  );
}

function getMissingTable(errorMessage) {
  if (typeof errorMessage !== 'string') return null;
  const match = errorMessage.match(/no such table: ([a-zA-Z0-9_]+)/i);
  return match ? match[1] : null;
}

function getErrorTone(error) {
  if (error?.code === 'NETWORK_ERROR' || error?.status === 0) {
    return 'warning';
  }
  if (error?.code === 'MISSING_TABLE') {
    return 'warning';
  }
  return 'danger';
}

function buildErrorModel(error, pathname) {
  const profile = getRouteProfile(pathname);
  const message = typeof error?.message === 'string' ? error.message : 'Unknown error';
  const missingTable = error?.missingTable || getMissingTable(message);
  const missingLabel = missingTable ? TABLE_LABELS[missingTable] || missingTable : null;
  const apiLabel = API_BASE.startsWith('/') ? `the dev proxy at ${API_BASE}` : API_BASE;

  if (error?.code === 'NETWORK_ERROR' || error?.status === 0) {
    return {
      tone: 'warning',
      kicker: 'API unreachable',
      title: `Can't load ${profile.pageLabel} right now`,
      description: `The client could not reach the leads API through ${apiLabel}.`,
      checklist: [
        API_BASE.startsWith('/')
          ? 'Start the leads API and make sure the Vite proxy target is reachable from this machine.'
          : `Start the leads API and make sure it is listening on ${API_BASE}.`,
        API_BASE.startsWith('/')
          ? 'If the backend is on another host or port, update VITE_API_TARGET and restart the client.'
          : 'If the backend is on another host or port, update VITE_API_BASE and restart the client.',
        'If the API is already running, check for a browser-side CORS or proxy issue.',
      ],
      missingTable: null,
      needs: profile.needs,
      technicalMessage: error?.causeMessage || message,
    };
  }

  if (missingTable) {
    return {
      tone: 'warning',
      kicker: 'Setup incomplete',
      title: `This page doesn't have ${missingLabel} yet`,
      description: `The API responded, but the database is missing the ${missingTable} table. This usually means migrations have not been run in this environment yet.`,
      checklist: [
        'Start the API once with RUN_MIGRATIONS=1 so the SQLite schema is created.',
        'Reload this page after the backend has initialized the database.',
        'If the schema exists but the page is still empty, add the setup records listed below.',
      ],
      missingTable,
      needs: profile.needs,
      technicalMessage: message,
    };
  }

  if (error?.status === 404) {
    return {
      tone: 'warning',
      kicker: 'Endpoint missing',
      title: `The ${profile.pageLabel} endpoint is not available`,
      description: 'The client is calling an API route that the current backend is not serving.',
      checklist: [
        'Make sure the client and API are running from the same leads-app code version.',
        'Confirm the backend has all expected routes registered.',
        'Restart both processes after pulling code or changing env vars.',
      ],
      missingTable: null,
      needs: profile.needs,
      technicalMessage: message,
    };
  }

  return {
    tone: getErrorTone(error),
    kicker: 'Server error',
    title: `The ${profile.pageLabel} request failed`,
    description: 'The backend answered, but it returned an error the client could not recover from.',
    checklist: [
      'Check the API logs for the failing request.',
      'Confirm any required API keys and local services are configured.',
      'Reload after fixing the backend issue.',
    ],
    missingTable: null,
    needs: profile.needs,
    technicalMessage: message,
  };
}

export default function QueryErrorCard({ error }) {
  const location = useLocation();

  if (!error) {
    return null;
  }

  const model = buildErrorModel(error, location.pathname);

  return (
    <section className="query-error-card" data-tone={model.tone} role="alert">
      <div className="query-error-header">
        <span className="query-error-kicker">{model.kicker}</span>
        <h2 className="query-error-title">{model.title}</h2>
        <p className="query-error-description">{model.description}</p>
      </div>

      <div className="query-error-grid">
        <div className="query-error-panel">
          <h3>This page expects</h3>
          {model.needs.length ? (
            <ul className="query-error-needs">
              {model.needs.map((item) => {
                const isMissing = model.missingTable === item.key;
                return (
                  <li key={item.key} className="query-error-need" data-state={isMissing ? 'missing' : 'expected'}>
                    <span>{item.label}</span>
                    <strong>{isMissing ? 'Missing' : 'Needed'}</strong>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="query-error-note">This page has no extra setup notes yet.</p>
          )}
        </div>

        <div className="query-error-panel">
          <h3>Check next</h3>
          <ul className="query-error-list">
            {model.checklist.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="query-error-actions">
        <button type="button" className="button secondary" onClick={() => window.location.reload()}>
          Reload page
        </button>
        <span className="query-error-api">API: {API_BASE}</span>
      </div>

      <details className="query-error-details">
        <summary>Technical details</summary>
        <code>{model.technicalMessage}</code>
      </details>
    </section>
  );
}
