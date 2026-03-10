import {
  buildSubredditUrl,
  formatSubredditDate,
  truncateSubredditDescription,
} from '../utils/subredditPresentation';

export default function SubredditRow({
  categoryName,
  isMutating,
  onDelete,
  onEdit,
  subreddit,
}) {
  return (
    <tr>
      <td>{subreddit.id}</td>
      <td>
        <a
          href={buildSubredditUrl(subreddit.subreddit)}
          target="_blank"
          rel="noopener noreferrer"
        >
          r/{subreddit.subreddit}
        </a>
      </td>
      <td>
        <strong>{subreddit.display_name}</strong>
      </td>
      <td>
        <span className="badge">{categoryName}</span>
      </td>
      <td>{truncateSubredditDescription(subreddit.description)}</td>
      <td>{formatSubredditDate(subreddit.created_at)}</td>
      <td className="actions">
        <button className="button-sm" onClick={() => onEdit(subreddit)}>
          Edit
        </button>
        <button
          className="button-sm danger"
          onClick={() => onDelete(subreddit.id)}
          disabled={isMutating}
        >
          Delete
        </button>
      </td>
    </tr>
  );
}
