import InstagramFeedRow from './InstagramFeedRow';

export default function InstagramFeedsTable({
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
            <th>Username</th>
            <th>Display Name</th>
            <th>Category</th>
            <th>Country</th>
            <th>Tags</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {feeds.map((feed) => (
            <InstagramFeedRow
              key={feed.id}
              feed={feed}
              categoryName={categoryNames.get(feed.category_id) || 'Unknown'}
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
