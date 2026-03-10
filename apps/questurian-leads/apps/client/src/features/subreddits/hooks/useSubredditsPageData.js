import { useMemo } from 'react';
import { useCategories, useSubreddits } from '../../../hooks';

export function useSubredditsPageData() {
  const {
    data: subreddits = [],
    isLoading: subredditsLoading,
    isFetching: subredditsFetching,
    error: subredditsError,
  } = useSubreddits();
  const {
    data: categories = [],
    isLoading: categoriesLoading,
    error: categoriesError,
  } = useCategories();

  const categoryNames = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  );

  return {
    categories,
    categoryNames,
    error: subredditsError || categoriesError,
    isLoading: subredditsLoading || categoriesLoading,
    isRefreshing: subredditsFetching && !subredditsLoading,
    subreddits,
  };
}
