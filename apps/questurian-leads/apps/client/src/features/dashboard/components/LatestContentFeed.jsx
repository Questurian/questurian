import LeadCard from './cards/LeadCard';
import InstagramCard from './cards/InstagramCard';
import ElComercioCard from './cards/ElComercioCard';
import DiarioCorreoCard from './cards/DiarioCorreoCard';
import YouTubeCard from './cards/YouTubeCard';
import ScrapeCard from './cards/ScrapeCard';
import { getDashboardItemKey } from '../utils/dashboardItems';

function renderDashboardItem({
  categoryFilter,
  item,
  lookups,
  showTranslated,
}) {
  switch (item.type) {
    case 'lead':
      return (
        <LeadCard
          key={getDashboardItemKey(item)}
          lead={item.data}
          lookups={lookups}
          categoryFilter={categoryFilter}
          showTranslated={showTranslated}
        />
      );
    case 'instagram':
      return (
        <InstagramCard
          key={getDashboardItemKey(item)}
          post={item.data}
          lookups={lookups}
          categoryFilter={categoryFilter}
          showTranslated={showTranslated}
        />
      );
    case 'el_comercio':
      return (
        <ElComercioCard
          key={getDashboardItemKey(item)}
          post={item.data}
          lookups={lookups}
          categoryFilter={categoryFilter}
          showTranslated={showTranslated}
        />
      );
    case 'diario_correo':
      return (
        <DiarioCorreoCard
          key={getDashboardItemKey(item)}
          post={item.data}
          lookups={lookups}
          categoryFilter={categoryFilter}
          showTranslated={showTranslated}
        />
      );
    case 'youtube':
      return (
        <YouTubeCard
          key={getDashboardItemKey(item)}
          post={item.data}
          lookups={lookups}
          categoryFilter={categoryFilter}
        />
      );
    case 'scrape':
      return <ScrapeCard key={getDashboardItemKey(item)} scrape={item.data} />;
    default:
      return null;
  }
}

export default function LatestContentFeed({
  canObserve,
  categoryFilter,
  emptyMessage,
  hasMoreItems,
  isLoading,
  isLoadingMore,
  items,
  loadMoreRef,
  lookups,
  onLoadMore,
  showTranslated,
  totalCount,
  visibleCount,
}) {
  return (
    <>
      <section className="section-header">
        <h2 className="section-title">Latest Content</h2>
        <div className="section-actions">
          <span className="badge">{items.length} of {totalCount}</span>
        </div>
      </section>

      {isLoading && totalCount === 0 ? (
        <div className="loading">Loading approved content...</div>
      ) : (
        <div className="leads-list">
          {items.map((item) => renderDashboardItem({
            categoryFilter,
            item,
            lookups,
            showTranslated,
          }))}
        </div>
      )}

      {(hasMoreItems || visibleCount < totalCount) && (
        <div className="load-more" ref={loadMoreRef}>
          {!canObserve && (
            <button
              className="button secondary"
              onClick={onLoadMore}
              disabled={isLoadingMore}
            >
              {isLoadingMore ? 'Loading more...' : 'Load more'}
            </button>
          )}
          {canObserve && isLoadingMore && (
            <div className="loading">Loading more...</div>
          )}
        </div>
      )}

      {totalCount === 0 && !isLoading && (
        <div className="empty-state">
          <p>{emptyMessage}</p>
        </div>
      )}
    </>
  );
}
