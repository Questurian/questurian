import { addNightlifeSchema } from './add-nightlife.schema';

declare const describe: (name: string, callback: () => void) => void;
declare const test: (name: string, callback: () => void) => void;
declare const expect: (value: unknown) => {
  toBe: (expected: unknown) => void;
};

const validBaseForm = {
  name: 'Test Nightclub',
  idealFor: ['Date Night'],
  priceTier: '$$$',
  clubType: 'Cocktail Bar',
  music: ['House'],
  venueType: 'Bar',
  venueSize: 'Large',
  spaceLayout: ['Indoor'],
  vibe: ['Upscale'],
  peakHours: '1:00 AM - 3:30 AM',
  touristPresence: 'Low',
  musicFormat: ['Open Format'],
  dressCode: ['Upscale'],
  energyLevel: 'High',
  vipAndBottleService: 'Yes',
  crowdProfile: '20-40',
  countryCode: 'PE',
  location: '123 Main St, Lima',
  phone: '+51 999 555 444',
  hours: '',
  tripadvisorUrl: '',
  website: 'https://example.com/club',
  bookingUrl: '',
  district: 'Miraflores',
  locationKey: 'peru|lima|miraflores',
  ianaTimeId: 'America/Lima',
  placeId: 'ChIJ123',
  googleUrl: 'https://www.google.com/maps/place/test',
  latitude: '-12.0464',
  longitude: '-77.0428',
  daytimeRestaurant: '0',
};

describe('add nightlife schema', () => {
  test('accepts a valid nightlife payload with blank TripAdvisor URL', () => {
    const result = addNightlifeSchema.safeParse(validBaseForm);
    expect(result.success).toBe(true);
  });

  test('accepts a valid nightlife payload with TripAdvisor URL', () => {
    const result = addNightlifeSchema.safeParse({
      ...validBaseForm,
      tripadvisorUrl:
        'https://www.tripadvisor.com/Restaurant_Review-g294316-d23520604-Reviews-Asu-Lima_Lima_Region.html',
    });

    expect(result.success).toBe(true);
  });

  test('accepts the no music ambience-only option', () => {
    const result = addNightlifeSchema.safeParse({
      ...validBaseForm,
      music: ['No Music / Ambience Only'],
    });

    expect(result.success).toBe(true);
  });

  test('accepts newly added SEO-friendly ideal for nightlife tags', () => {
    const result = addNightlifeSchema.safeParse({
      ...validBaseForm,
      idealFor: ['Casual Nights Out', 'After-Work Drinks'],
    });

    expect(result.success).toBe(true);
  });

  test('rejects an invalid TripAdvisor URL', () => {
    const result = addNightlifeSchema.safeParse({
      ...validBaseForm,
      tripadvisorUrl: 'not-a-url',
    });

    expect(result.success).toBe(false);
  });
});
