import QueryErrorCard from '../components/QueryErrorCard';
import ElComercioPostsFilters from '../features/el-comercio/posts/components/ElComercioPostsFilters';
import ElComercioPostsHeader from '../features/el-comercio/posts/components/ElComercioPostsHeader';
import ElComercioPostsList from '../features/el-comercio/posts/components/ElComercioPostsList';
import { useElComercioPostsActions } from '../features/el-comercio/posts/hooks/useElComercioPostsActions';
import { useElComercioPostsFilters } from '../features/el-comercio/posts/hooks/useElComercioPostsFilters';
import { useElComercioPostsInfiniteScroll } from '../features/el-comercio/posts/hooks/useElComercioPostsInfiniteScroll';
import { useElComercioPostsPageData } from '../features/el-comercio/posts/hooks/useElComercioPostsPageData';

export default function ElComercioPosts() {
  const filters = useElComercioPostsFilters();
  const data = useElComercioPostsPageData(filters.values);
  const actions = useElComercioPostsActions();
  const infinite = useElComercioPostsInfiniteScroll({
    fetchNextPage: data.fetchNextPage,
    hasNextPage: data.hasNextPage,
    isFetchingNextPage: data.isFetchingNextPage,
  });

  return (
    <div className="page">
      <ElComercioPostsHeader
        count={data.posts.length}
        isMutating={actions.isMutating}
        isRefreshing={data.isRefreshing}
        onScrape={actions.handleFetchArticles}
        scrapePending={actions.scrapePending}
      />

      {data.error && <QueryErrorCard error={data.error} />}

      <ElComercioPostsFilters
        feeds={data.feeds}
        filters={filters.values}
        onChange={filters.handleChange}
        onClear={filters.clear}
      />

      <ElComercioPostsList
        feedNames={data.feedNames}
        fetchNextPage={data.fetchNextPage}
        hasNextPage={data.hasNextPage}
        isFetchingNextPage={data.isFetchingNextPage}
        isLoading={data.isLoading}
        isMutating={actions.isMutating}
        loadMoreRef={infinite.loadMoreRef}
        onDelete={actions.handleDelete}
        posts={data.posts}
      />
    </div>
  );
}
