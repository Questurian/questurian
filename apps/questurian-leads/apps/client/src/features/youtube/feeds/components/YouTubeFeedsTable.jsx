import YouTubeFeedRow from './YouTubeFeedRow';

export default function YouTubeFeedsTable({
  categoryNames,
  feeds,
  isMutating,
  onDelete,
  onEdit,
  onFetch,
}) {
  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Channel</th>
            <th>Category</th>
            <th>Country</th>
            <th>Last Fetched</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {feeds.map((feed) => (
            <YouTubeFeedRow
              key={feed.id}
              categoryName={categoryNames.get(feed.category_id) || 'Unknown'}
              feed={feed}
              isMutating={isMutating}
              onDelete={onDelete}
              onEdit={onEdit}
              onFetch={onFetch}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
