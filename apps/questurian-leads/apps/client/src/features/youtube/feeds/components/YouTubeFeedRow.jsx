import { formatYouTubeLastFetched } from '../utils/youtubeFeedPresentation';

export default function YouTubeFeedRow({
  categoryName,
  feed,
  isMutating,
  onDelete,
  onEdit,
  onFetch,
}) {
  return (
    <tr>
      <td>{feed.id}</td>
      <td>
        <div>
          <strong>{feed.display_name}</strong>
          <div>{feed.channel_id}</div>
          {feed.channel_url && (
            <a href={feed.channel_url} target="_blank" rel="noopener noreferrer">
              Channel Link
            </a>
          )}
        </div>
      </td>
      <td>{categoryName}</td>
      <td>{feed.country || '-'}</td>
      <td>{formatYouTubeLastFetched(feed.last_fetched)}</td>
      <td>
        <div className="action-buttons">
          <button
            className="button-sm success"
            onClick={() => onFetch(feed.id)}
            disabled={isMutating}
          >
            Fetch
          </button>
          <button
            className="button-sm"
            onClick={() => onEdit(feed)}
            disabled={isMutating}
          >
            Edit
          </button>
          <button
            className="button-sm danger"
            onClick={() => onDelete(feed.id)}
            disabled={isMutating}
          >
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
}
