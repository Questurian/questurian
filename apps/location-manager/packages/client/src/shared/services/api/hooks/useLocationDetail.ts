import { useQuery } from '@tanstack/react-query';
import { locationsApi } from '../locations.api';
import { LOCATION_DETAIL_QUERY_KEY } from './location-query-keys';
import type { Category } from '../types';

export function useLocationDetail(
  id: number | null,
  category: Category | null,
  enabled = true
) {
  const queryCategory = category ?? 'missing-category';
  return useQuery({
    queryKey: LOCATION_DETAIL_QUERY_KEY(queryCategory, id!),
    queryFn: () => locationsApi.getLocationById(id!, category!),
    enabled: enabled && id !== null && category !== null,
    refetchOnMount: 'always',
  });
}
