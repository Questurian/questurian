export interface Neighborhood {
  label: string;
  value: string;
}

export interface City {
  label: string;
  value: string;
  neighborhoods: Neighborhood[];
}

export interface Country {
  code: string;
  label: string;
  cities: City[];
}

export interface LocationHierarchyItem {
  id: number;
  country: string;
  city: string;
  neighborhood: string;
  locationKey: string;
}

export interface LocationHierarchyResponse {
  locations: LocationHierarchyItem[];
}

export interface CountriesResponse {
  countries: Country[];
}

export interface CitiesResponse {
  cities: City[];
}

export interface NeighborhoodsResponse {
  neighborhoods: Neighborhood[];
}
