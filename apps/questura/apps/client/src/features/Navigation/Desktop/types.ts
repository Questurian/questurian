export type DropdownView = "main" | "cities" | "countries" | "country-cities";

export interface CountryInfo {
  slug: string;
  name: string;
  countryCode: string;
}

export interface LocationPillProps {
  cityName: string;
  countryName: string;
  countryCode?: string;
  currentCityId?: string;
  currentCountry?: string;
}
