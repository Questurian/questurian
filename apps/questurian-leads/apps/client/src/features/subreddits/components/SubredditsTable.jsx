import SubredditRow from './SubredditRow';

export default function SubredditsTable({
  categoryNames,
  isMutating,
  onDelete,
  onEdit,
  subreddits,
}) {
  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Subreddit</th>
            <th>Display Name</th>
            <th>Category</th>
            <th>Description</th>
            <th>Added</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {subreddits.map((subreddit) => (
            <SubredditRow
              key={subreddit.id}
              subreddit={subreddit}
              categoryName={categoryNames.get(subreddit.category_id) || 'Unknown'}
              isMutating={isMutating}
              onDelete={onDelete}
              onEdit={onEdit}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
