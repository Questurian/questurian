import QueryErrorCard from '../components/QueryErrorCard';
import InstagramPostsFilters from '../features/instagram/posts/components/InstagramPostsFilters';
import InstagramPostsHeader from '../features/instagram/posts/components/InstagramPostsHeader';
import InstagramPostsList from '../features/instagram/posts/components/InstagramPostsList';
import { useInstagramPostsActions } from '../features/instagram/posts/hooks/useInstagramPostsActions';
import { useInstagramPostsFilters } from '../features/instagram/posts/hooks/useInstagramPostsFilters';
import { useInstagramPostsPageData } from '../features/instagram/posts/hooks/useInstagramPostsPageData';

export default function InstagramPosts() {
  const filters = useInstagramPostsFilters();
  const data = useInstagramPostsPageData(filters.values);
  const actions = useInstagramPostsActions();

  return (
    <div className="page">
      <InstagramPostsHeader
        count={data.posts.length}
        isRefreshing={data.isRefreshing}
      />

      {data.error && <QueryErrorCard error={data.error} />}

      <InstagramPostsFilters
        categories={data.categories}
        feeds={data.feeds}
        filters={filters.values}
        onChange={filters.handleChange}
        onClear={filters.clear}
        tags={data.tags}
      />

      <InstagramPostsList
        feedNames={data.feedNames}
        isLoading={data.isLoading}
        isMutating={actions.isMutating}
        onDelete={actions.handleDelete}
        posts={data.posts}
      />
    </div>
  );
}
