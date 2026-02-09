export interface City {
  id: string;
  name: string;
  country: string;
  displayCountry: string;
  flag: string;
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
