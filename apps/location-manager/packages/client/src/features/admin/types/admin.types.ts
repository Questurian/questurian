export interface FilterOption {
  value: string;
  label: string;
  count: number;
}

export interface TaxonomyFilterState {
  country: string | null;
  city: string | null;
  neighborhood: string | null;
}
