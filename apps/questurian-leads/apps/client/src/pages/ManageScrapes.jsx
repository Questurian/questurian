import {
  useDiarioCurrentScrapeJob,
  useDiarioCorreoFeeds,
  useElComercioCurrentScrapeJob,
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

function parseJobResult(job) {
  if (!job?.result_json) return null;
  try {
    return JSON.parse(job.result_json);
  } catch (error) {
    return null;
  }
}

function formatJobStatus(status) {
  switch (status) {
    case 'queued':
      return 'Queued';
    case 'running':
      return 'Running';
    case 'success':
      return 'Success';
    case 'partial':
      return 'Partial';
    case 'failed':
      return 'Failed';
    default:
      return 'Idle';
  }
}

function isJobActive(job) {
  return job && ['queued', 'running'].includes(job.status);
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
  const { data: elComercioJob } = useElComercioCurrentScrapeJob();
  const { data: diarioCorreoJob } = useDiarioCurrentScrapeJob();

  const fetchElComercio = useFetchElComercioFeed();
  const fetchDiarioCorreo = useFetchDiarioCorreoFeed();

  const elComercioFeed = elComercioFeeds[0];
  const diarioCorreoFeed = diarioCorreoFeeds[0];
  const isRefreshing = elLoading || diarioLoading;
  const error = elError || diarioError;

  async function handleFetch(label, mutate) {
    try {
      const job = await mutate();
      const message = isJobActive(job)
        ? `${label} scrape queued.\n\nJob #${job.id} is now ${formatJobStatus(job.status).toLowerCase()}.`
        : `${label} scrape state updated.\n\n${job.message || `Job #${job.id}`}`;
      await dialog.alert(message);
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
      description: 'Queues a background scrape for the archive, preserves existing rows, and inserts only newly discovered article URLs.',
      feed: elComercioFeed,
      job: elComercioJob,
      isPending: fetchElComercio.isPending,
      onFetch: () => handleFetch('El Comercio', fetchElComercio.mutateAsync),
    },
    {
      key: 'diario-correo',
      name: 'Diario Correo',
      section: 'Gastronomia',
      url: 'https://diariocorreo.pe/gastronomia/',
      description: 'Queues a background scrape for the section, preserves existing rows, and inserts only newly discovered article URLs.',
      feed: diarioCorreoFeed,
      job: diarioCorreoJob,
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
            Hard-coded Peru sources. Scrapes now run in the background, preserve history, and add only new article URLs.
          </p>
        </div>
        {isRefreshing && <span className="badge">Refreshing...</span>}
      </div>

      {error && <QueryErrorCard error={error} />}

      <div className="leads-list">
        {sources.map((source) => {
          const lastFetched = formatDate(source.feed?.last_fetched);
          const displayName = source.feed?.display_name || source.name;
          const fetchLabel = source.isPending
            ? 'Queueing...'
            : isJobActive(source.job)
              ? 'Queued...'
              : source.feed?.last_fetched
                ? 'Queue Refetch'
                : 'Queue Fetch';
          const result = parseJobResult(source.job);
          const lastJobAt = formatDate(
            source.job?.finished_at || source.job?.started_at || source.job?.created_at,
          );

          return (
            <div key={source.key} className="lead-card">
              <div className="lead-header">
                <div>
                  <h3>{displayName}</h3>
                  <div className="lead-meta">
                    <span className="badge">Peru</span>
                    <span className="badge secondary">{source.section}</span>
                    {source.job && (
                      <span className="badge secondary">
                        Job: {formatJobStatus(source.job.status)}
                      </span>
                    )}
                    <span>Last fetched: {lastFetched}</span>
                  </div>
                </div>
                <button
                  className="button primary"
                  onClick={source.onFetch}
                  disabled={source.isPending || isJobActive(source.job)}
                >
                  {fetchLabel}
                </button>
              </div>

              <p className="lead-summary">{source.description}</p>

              {source.job && (
                <p className="lead-summary">
                  Latest job: {lastJobAt}
                  {result ? ` | New: ${result.new_post_count ?? result.post_count ?? 0} | Existing: ${result.existing_post_count ?? 0} | Invalid: ${result.invalid_post_count ?? 0}` : ''}
                  {source.job.error_message ? ` | Error: ${source.job.error_message}` : ''}
                </p>
              )}

              <div className="lead-footer">
                Source: {source.url}
                {source.job?.artifact_dir ? ` | Artifacts: ${source.job.artifact_dir}` : ''}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
