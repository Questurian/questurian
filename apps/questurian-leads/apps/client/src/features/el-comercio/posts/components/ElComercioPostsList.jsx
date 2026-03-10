import { Link } from 'react-router-dom';
import ElComercioPostCard from './ElComercioPostCard';

export default function ElComercioPostsList({
  feedNames,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
  isLoading,
  isMutating,
  loadMoreRef,
  onDelete,
  posts,
}) {
  if (isLoading) {
    return <div className="loading">Loading articles...</div>;
  }

  if (posts.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
        <p>No articles found. Try adjusting your filters or scraping a feed.</p>
        <Link to="/scrapes/manage" className="button" style={{ marginTop: '20px' }}>
          Go to Feeds
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="leads-list">
        {posts.map((post) => (
          <ElComercioPostCard
            key={post.id}
            post={post}
            feedNames={feedNames}
            isMutating={isMutating}
            onDelete={onDelete}
          />
        ))}
      </div>

      {hasNextPage && (
        <div className="load-more" ref={loadMoreRef}>
          <button
            className="button secondary"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? 'Loading more...' : 'Load more articles'}
          </button>
        </div>
      )}
    </>
  );
}
