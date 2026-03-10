import QueryErrorCard from '../components/QueryErrorCard';
import DashboardFilters from '../features/dashboard/components/DashboardFilters';
import DashboardHero from '../features/dashboard/components/DashboardHero';
import LatestContentFeed from '../features/dashboard/components/LatestContentFeed';
import DashboardStatsGrid from '../features/dashboard/components/DashboardStatsGrid';
import SubredditSpotlight from '../features/dashboard/components/SubredditSpotlight';
import { useDashboardData } from '../features/dashboard/hooks/useDashboardData';
import { useDashboardInfiniteScroll } from '../features/dashboard/hooks/useDashboardInfiniteScroll';

export default function Dashboard() {
  const dashboard = useDashboardData();
  const { canObserve, loadMoreRef } = useDashboardInfiniteScroll({
    hasMoreItems: dashboard.hasMoreItems,
    isLoadingMore: dashboard.isLoadingMore,
    loadMoreItems: dashboard.loadMoreItems,
    totalCount: dashboard.totalCount,
    visibleCount: dashboard.visibleCount,
  });

  return (
    <div className="page dashboard">
      <DashboardHero />

      <DashboardStatsGrid
        stats={dashboard.stats}
        isRefreshing={dashboard.isFetching && !dashboard.isLoading}
      />

      {dashboard.error && <QueryErrorCard error={dashboard.error} />}

      <SubredditSpotlight
        categoryNames={dashboard.lookups.categoryNames}
        subredditPicks={dashboard.subredditPicks}
        subredditsError={dashboard.subredditsError}
        subredditsLoading={dashboard.subredditsLoading}
      />

      <DashboardFilters
        categories={dashboard.categories}
        categoryFilter={dashboard.categoryFilter}
        isCategoriesLoading={dashboard.categoriesLoading}
        onCategoryChange={dashboard.setCategoryFilter}
        onSearchChange={dashboard.setSearchFilter}
        searchFilter={dashboard.searchFilter}
      />

      <LatestContentFeed
        canObserve={canObserve}
        categoryFilter={dashboard.categoryFilter}
        emptyMessage={dashboard.emptyMessage}
        hasMoreItems={dashboard.hasMoreItems}
        isLoading={dashboard.isLoading}
        isLoadingMore={dashboard.isLoadingMore}
        items={dashboard.visibleItems}
        loadMoreRef={loadMoreRef}
        lookups={dashboard.lookups}
        onLoadMore={dashboard.loadMoreItems}
        showTranslated={dashboard.showTranslated}
        totalCount={dashboard.totalCount}
        visibleCount={dashboard.visibleCount}
      />
    </div>
  );
}
