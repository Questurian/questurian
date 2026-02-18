export const LOCATION_DETAIL_QUERY_KEY = (category: string, id: number) =>
  ['location-detail', category, id] as const;
