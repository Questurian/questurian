import InstagramPostCard from './InstagramPostCard';

export default function InstagramPostsList({
  feedNames,
  isLoading,
  isMutating,
  onDelete,
  posts,
}) {
  if (isLoading) {
    return <div className="loading">Loading Instagram posts...</div>;
  }

  if (posts.length === 0) {
    return (
      <div className="empty-state">
        <p>
          No Instagram posts found. Try adjusting your filters or fetch some
          Instagram feeds!
        </p>
      </div>
    );
  }

  return (
    <div className="leads-list">
      {posts.map((post) => (
        <InstagramPostCard
          key={post.id}
          post={post}
          feedNames={feedNames}
          isMutating={isMutating}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
