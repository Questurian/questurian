import { formatFeedUrl } from '../utils/feedPresentation';

export default function FeedRow({
  activeFetchId,
  categoryName,
  feed,
  isFetchPending,
  isMutating,
  onDelete,
  onEdit,
  onFetch,
}) {
  return (
    <tr>
      <td>{feed.id}</td>
      <td><strong>{feed.source_name}</strong></td>
      <td>
        <span className="badge">{categoryName}</span>
      </td>
      <td>{feed.country || '-'}</td>
      <td>
        <a
          href={feed.url}
          target="_blank"
          rel="noopener noreferrer"
          className="link-small"
        >
          {formatFeedUrl(feed.url)}
        </a>
      </td>
      <td>
        {feed.tags && feed.tags.length > 0 ? (
          <div className="tags">
            {feed.tags.map((tag) => (
              <span key={tag} className="tag">{tag}</span>
            ))}
          </div>
        ) : '-'}
      </td>
      <td className="actions">
        <button
          className="button-sm success"
          onClick={() => onFetch(feed.id)}
          disabled={isMutating}
        >
          {isFetchPending && activeFetchId === feed.id ? 'Fetching...' : 'Fetch'}
        </button>
        <button className="button-sm" onClick={() => onEdit(feed)}>
          Edit
        </button>
        <button
          className="button-sm danger"
          onClick={() => onDelete(feed.id)}
          disabled={isMutating}
        >
          Delete
        </button>
      </td>
    </tr>
  );
}
