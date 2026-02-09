export interface City {
  id: string;
  name: string;
  country: string;
  displayCountry: string;
  countryCode: string; // ISO 3166-1 alpha-2 code for flag API
  tag: string;
  image: string;
  description: string;
}

export interface Intent {
  id: string;
  title: string;
  subtitle: string;
  verb: string;
  image: string;
  description: string;
  features: string[];
}
