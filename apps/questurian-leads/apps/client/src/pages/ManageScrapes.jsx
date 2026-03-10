import {
  useDiarioCorreoFeeds,
  useElComercioFeeds,
  useFetchDiarioCorreoFeed,
  useFetchElComercioFeed,
} from '../hooks';
import QueryErrorCard from '../components/QueryErrorCard';
import { useDialog } from '../providers/DialogProvider';

function formatDate(value) {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Never';
  return date.toLocaleString();
}

function formatResultDetails(result) {
  const lines = [
    `Status: ${result.status}`,
    `New posts: ${result.new_post_count ?? result.post_count ?? 0}`,
    `Already stored: ${result.existing_post_count ?? 0}`,
    `Invalid/failed: ${result.invalid_post_count ?? 0}`,
  ];

  if (result.error_message) {
    lines.push('', 'Errors:', result.error_message);
  }

  return lines.join('\n');
}

export default function ManageScrapes() {
  const dialog = useDialog();
  const {
    data: elComercioFeeds = [],
    isLoading: elLoading,
    error: elError,
  } = useElComercioFeeds();
  const {
    data: diarioCorreoFeeds = [],
    isLoading: diarioLoading,
    error: diarioError,
  } = useDiarioCorreoFeeds();

  const fetchElComercio = useFetchElComercioFeed();
  const fetchDiarioCorreo = useFetchDiarioCorreoFeed();

  const elComercioFeed = elComercioFeeds[0];
  const diarioCorreoFeed = diarioCorreoFeeds[0];
  const isRefreshing = elLoading || diarioLoading;
  const error = elError || diarioError;

  async function handleFetch(label, mutate) {
    try {
      const result = await mutate();
      await dialog.alert(`${label} scrape finished.\n\n${formatResultDetails(result)}`);
    } catch (err) {
      await dialog.alert(`Error: ${err.message}`);
    }
  }

  const sources = [
    {
      key: 'el-comercio',
      name: 'El Comercio',
      section: 'Gastronomia',
      url: 'https://elcomercio.pe/archivo/gastronomia/',
      description: 'Scrapes the archive, preserves existing rows, and inserts only newly discovered article URLs.',
      feed: elComercioFeed,
      isPending: fetchElComercio.isPending,
      onFetch: () => handleFetch('El Comercio', fetchElComercio.mutateAsync),
    },
    {
      key: 'diario-correo',
      name: 'Diario Correo',
      section: 'Gastronomia',
      url: 'https://diariocorreo.pe/gastronomia/',
      description: 'Scrapes the section, preserves existing rows, and inserts only newly discovered article URLs.',
      feed: diarioCorreoFeed,
      isPending: fetchDiarioCorreo.isPending,
      onFetch: () => handleFetch('Diario Correo', fetchDiarioCorreo.mutateAsync),
    },
  ];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Manage Scrapes</h1>
          <p className="page-subtitle">
            Hard-coded Peru sources. Fetch runs synchronously, preserves history, and adds only new article URLs.
          </p>
        </div>
        {isRefreshing && <span className="badge">Refreshing...</span>}
      </div>

      {error && <QueryErrorCard error={error} />}

      <div className="leads-list">
        {sources.map((source) => {
          const lastFetched = formatDate(source.feed?.last_fetched);
          const displayName = source.feed?.display_name || source.name;
          const fetchLabel = source.feed?.last_fetched ? 'Refetch' : 'Fetch';

          return (
            <div key={source.key} className="lead-card">
              <div className="lead-header">
                <div>
                  <h3>{displayName}</h3>
                  <div className="lead-meta">
                    <span className="badge">Peru</span>
                    <span className="badge secondary">{source.section}</span>
                    <span>Last fetched: {lastFetched}</span>
                  </div>
                </div>
                <button
                  className="button primary"
                  onClick={source.onFetch}
                  disabled={source.isPending}
                >
                  {source.isPending ? 'Fetching...' : fetchLabel}
                </button>
              </div>

              <p className="lead-summary">{source.description}</p>

              <div className="lead-footer">
                Source: {source.url}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
