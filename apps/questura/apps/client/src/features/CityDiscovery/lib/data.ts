import type { City } from '../types';

export const cities: City[] = [
  {
    id: 'lima',
    name: 'Lima',
    country: 'peru',
    displayCountry: 'Peru',
    countryCode: 'pe',
    tag: 'Culinary Capital',
    image: 'https://images.unsplash.com/photo-1587595431973-160d0d94add1?w=1200&q=85',
    description:
      'Discover the gastronomic capital of South America, where ancient history meets world-class cuisine.',
  },
];

export function getCityBySlug(countrySlug: string, citySlug: string): City | undefined {
  const country = countrySlug.toLowerCase();
  const city = citySlug.toLowerCase();
  return cities.find((c) => c.country === country && c.id === city);
}
