import FeedRow from './FeedRow';

export default function FeedsTable({
  activeFetchId,
  categoryNames,
  feeds,
  isFetchPending,
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
            <th>Source</th>
            <th>Category</th>
            <th>Country</th>
            <th>URL</th>
            <th>Tags</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {feeds.map((feed) => (
            <FeedRow
              key={feed.id}
              activeFetchId={activeFetchId}
              categoryName={categoryNames.get(feed.category_id) || 'Unknown'}
              feed={feed}
              isFetchPending={isFetchPending}
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
