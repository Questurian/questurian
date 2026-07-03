export type UnknownRecord = Record<string, unknown>;

export interface ParsedNightlifeDetails {
  hasDetails: boolean;
  name: string | null;
  priceTier: string | null;
  clubType: string | null;
  music: string[];
  venueType: string | null;
  venueSize: string | null;
  spaceLayout: string[];
  vibe: string[];
  peakHours: string | null;
  touristPresence: string | null;
  musicFormat: string[];
  dressCode: string[];
  energyLevel: string | null;
  vipAndBottleService: string | null;
  crowdProfile: string | null;
  location: string | null;
  phone: string | null;
  hours: string | null;
  website: string | null;
  bookingUrl: string | null;
  daytimeRestaurant: string | null;
}

export interface BuildNightlifeDetailsInput {
  name: string;
  priceTier: string;
  clubType: string;
  music: string[];
  venueType: string;
  venueSize: string;
  spaceLayout: string[];
  vibe: string[];
  peakHours: string;
  touristPresence: string;
  musicFormat: string[];
  dressCode: string[];
  energyLevel: string;
  vipAndBottleService: string;
  crowdProfile: string;
  location: string;
  phone: string;
  hours: string;
  website: string;
  bookingUrl: string;
  daytimeRestaurant: string;
}

export interface NightlifeDetailsPayload extends Record<string, unknown> {
  name: string;
  price_tier: string;
  club_type: string;
  music: string[];
  details: {
    theSpace: Record<string, { label: string; value: string | string[] }>;
    theScene: Record<string, { label: string; value: string | string[] }>;
  };
  location: string;
  phone: string;
  hours: string;
  website: string;
  booking_url: string;
  daytime_restaurant: number;
}

export interface NightlifeFieldUpdatePayload {
  nightlifeDetails: Record<string, unknown>;
  type?: string;
  priceLevel?: string;
}
