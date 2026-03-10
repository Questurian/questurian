import {
  formatFetchLogDateTime,
  getFetchLogStatusClass,
} from '../utils/fetchLogPresentation';

export default function FetchLogRow({
  feedName,
  isMutating,
  log,
  onDelete,
}) {
  return (
    <tr>
      <td>{log.id}</td>
      <td>{feedName}</td>
      <td>{formatFetchLogDateTime(log.fetched_at)}</td>
      <td>
        <span className={`status ${getFetchLogStatusClass(log.status)}`}>
          {log.status || 'N/A'}
        </span>
      </td>
      <td>{log.lead_count ?? '-'}</td>
      <td className={log.error_message ? 'error-text' : ''}>
        {log.error_message || '-'}
      </td>
      <td className="actions">
        <button
          className="button-sm danger"
          onClick={() => onDelete(log.id)}
          disabled={isMutating}
        >
          Delete
        </button>
      </td>
    </tr>
  );
}
