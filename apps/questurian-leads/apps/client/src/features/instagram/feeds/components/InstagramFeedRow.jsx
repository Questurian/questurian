import { getInstagramFeedProfileUrl } from '../utils/instagramFeedPresentation';

export default function InstagramFeedRow({
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
        <a
          href={getInstagramFeedProfileUrl(feed)}
          target="_blank"
          rel="noopener noreferrer"
        >
          @{feed.username}
        </a>
      </td>
      <td>
        <strong>{feed.display_name}</strong>
      </td>
      <td>
        <span className="badge">{categoryName}</span>
      </td>
      <td>{feed.country || '-'}</td>
      <td>
        {feed.tags && feed.tags.length > 0 ? (
          <div className="tags">
            {feed.tags.map((tag) => (
              <span key={tag} className="tag">
                {tag}
              </span>
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
          Fetch
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
