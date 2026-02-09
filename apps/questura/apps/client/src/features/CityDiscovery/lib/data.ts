import { City, Intent } from '../types';

// High-quality Unsplash images for each city
export const cities: City[] = [
  {
    id: 'lima',
    name: 'Lima',
    country: 'peru',
    displayCountry: 'Peru',
    flag: '🇵🇪',
    tag: 'Culinary Capital',
    image: 'https://images.unsplash.com/photo-1587595431973-160d0d94add1?w=1200&q=85',
    description: 'Discover the gastronomic capital of South America, where ancient history meets world-class cuisine.',
  },
  {
    id: 'medellin',
    name: 'Medellín',
    country: 'colombia',
    displayCountry: 'Colombia',
    flag: '🇨🇴',
    tag: 'Digital Nomad Hub',
    image: 'https://images.unsplash.com/photo-1599571234909-29ed5d1321d6?w=1200&q=85',
    description: 'Experience the city of eternal spring, a vibrant hub for remote workers and entrepreneurs.',
  },
  {
    id: 'cartagena',
    name: 'Cartagena',
    country: 'colombia',
    displayCountry: 'Colombia',
    flag: '🇨🇴',
    tag: 'Caribbean Charm',
    image: 'https://images.unsplash.com/photo-1533653662686-3e8c9a27542b?w=1200&q=85',
    description: 'Wander through colorful colonial streets and soak up the Caribbean breeze.',
  },
  {
    id: 'mexico-city',
    name: 'Mexico City',
    country: 'mexico',
    displayCountry: 'Mexico',
    flag: '🇲🇽',
    tag: 'Cultural Capital',
    image: 'https://images.unsplash.com/photo-1518105779142-d975f22f1b0a?w=1200&q=85',
    description: 'Immerse yourself in one of the world\'s most vibrant cultural metropolises.',
  },
  {
    id: 'sao-paulo',
    name: 'São Paulo',
    country: 'brazil',
    displayCountry: 'Brazil',
    flag: '🇧🇷',
    tag: 'Urban Powerhouse',
    image: 'https://images.unsplash.com/photo-1483729558449-99ef09a8c325?w=1200&q=85',
    description: 'Dive into Brazil\'s bustling economic engine with endless cultural offerings.',
  },
  {
    id: 'rio',
    name: 'Rio de Janeiro',
    country: 'brazil',
    displayCountry: 'Brazil',
    flag: '🇧🇷',
    tag: 'Tropical Paradise',
    image: 'https://images.unsplash.com/photo-1483729558449-99ef09a8c325?w=1200&q=85',
    description: 'Live the carioca lifestyle between mountains, beaches, and samba rhythms.',
  },
  {
    id: 'buenos-aires',
    name: 'Buenos Aires',
    country: 'argentina',
    displayCountry: 'Argentina',
    flag: '🇦🇷',
    tag: 'European Soul',
    image: 'https://images.unsplash.com/photo-1589909202802-8f4aadce1849?w=1200&q=85',
    description: 'Experience the Paris of South America with its tango, cafes, and rich culture.',
  },
];

export const intents: Intent[] = [
  {
    id: 'explore',
    title: 'Explore',
    subtitle: 'Discover hidden gems in days',
    verb: 'explore',
    image: 'https://images.unsplash.com/photo-1523906834658-6e24ef2386f9?w=800&q=85',
    description: 'Perfect for short trips and weekend escapes. Dive into the culture, food, and nightlife with curated local experiences.',
    features: ['Curated itineraries', 'Local guides', 'Hidden gems'],
  },
  {
    id: 'stay',
    title: 'Stay',
    subtitle: 'Live like a local for months',
    verb: 'stay in',
    image: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&q=85',
    description: 'Ideal for digital nomads and extended travelers. Find your rhythm in a new city with comfortable long-term living.',
    features: ['Co-working spaces', 'Monthly rentals', 'Community'],
  },
  {
    id: 'move',
    title: 'Move',
    subtitle: 'Start your new chapter here',
    verb: 'move to',
    image: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&q=85',
    description: 'Ready to relocate? Get everything you need to make this city your new home, from visas to settling in.',
    features: ['Visa guidance', 'Housing search', 'Local services'],
  },
];

export function getCityBySlug(citySlug: string, countrySlug: string): City | undefined {
  return cities.find(
    c => c.id === citySlug.toLowerCase() && c.country === countrySlug.toLowerCase()
  );
}

export function getCityById(cityId: string): City | undefined {
  return cities.find(c => c.id === cityId.toLowerCase());
}

export function getIntentById(intentId: string): Intent | undefined {
  return intents.find(i => i.id === intentId.toLowerCase());
}
