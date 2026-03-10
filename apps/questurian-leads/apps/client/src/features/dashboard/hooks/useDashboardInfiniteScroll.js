import { useEffect, useRef } from 'react';

export function useDashboardInfiniteScroll({
  hasMoreItems,
  isLoadingMore,
  loadMoreItems,
  totalCount,
  visibleCount,
}) {
  const loadMoreRef = useRef(null);
  const canObserve = typeof IntersectionObserver !== 'undefined';

  useEffect(() => {
    const node = loadMoreRef.current;

    if (!node || !canObserve) return;
    if (!hasMoreItems && visibleCount >= totalCount) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        if (isLoadingMore) return;
        if (!hasMoreItems && visibleCount >= totalCount) return;

        loadMoreItems();
      },
      { rootMargin: '200px' },
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, [
    canObserve,
    hasMoreItems,
    isLoadingMore,
    loadMoreItems,
    totalCount,
    visibleCount,
  ]);

  return { canObserve, loadMoreRef };
}
