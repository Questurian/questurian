import { useState } from 'react';

export function useDashboardFilters() {
  const [searchFilter, setSearchFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  return {
    categoryFilter,
    searchFilter,
    setCategoryFilter,
    setSearchFilter,
  };
}
