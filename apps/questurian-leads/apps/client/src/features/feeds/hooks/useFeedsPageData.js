import { useMemo } from 'react';
import { useCategories, useCountries, useFeeds } from '../../../hooks';

export function useFeedsPageData() {
  const {
    data: feeds = [],
    isLoading: feedsLoading,
    isFetching: feedsFetching,
    error: feedsError,
  } = useFeeds();
  const {
    data: categories = [],
    isLoading: categoriesLoading,
    error: categoriesError,
  } = useCategories();
  const {
    data: countries = [],
    isLoading: countriesLoading,
    error: countriesError,
  } = useCountries();

  const categoryNames = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  );

  return {
    categories,
    categoryNames,
    countries,
    error: feedsError || categoriesError || countriesError,
    feeds,
    isLoading: feedsLoading || categoriesLoading || countriesLoading,
    isRefreshing: feedsFetching && !feedsLoading,
  };
}
