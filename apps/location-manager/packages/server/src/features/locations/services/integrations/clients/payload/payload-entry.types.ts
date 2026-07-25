import type { PayloadRelationshipId } from "./payload-shared.types";

export interface PayloadGalleryItem {
  image: PayloadRelationshipId;
  altText?: string;
  caption?: string;
}

export interface PayloadInstagramGalleryItem {
  post: PayloadRelationshipId;
}

export interface PayloadNightlifeDetails {
  core: {
    name: string;
    clubType: string | null;
    priceTier: string | null;
    music: string[];
    idealFor: string[];
  };
  theSpace: {
    venueType: string | null;
    venueSize: string | null;
    spaceLayout: string[];
    vibe: string[];
    peakHours: string | null;
  };
  theScene: {
    musicFormat: string[];
    touristPresence: string | null;
    dressCode: string[];
    energyLevel: string | null;
    vipAndBottleService: string | null;
    crowdProfile: string | null;
  };
  theDetails: {
    operationHours: Record<string, unknown> | null;
    bookingUrl: string | null;
    daytimeRestaurant: boolean;
  };
}

export interface PayloadEntryResponse {
  message: string;
  doc: {
    id: string;
    title: string;
    type?: string;
    locationRef?: string;
    gallery: Array<{
      image: {
        id: string;
        filename: string;
        url: string;
      };
      altText?: string;
      caption?: string;
      id: string;
    }>;
    instagramGallery?: Array<{
      post: {
        id: string;
        title: string;
        embedCode: string;
      };
      id: string;
    }>;
    status: "draft" | "published";
    createdAt: string;
    updatedAt: string;
  };
}

export interface PayloadEntryData {
  title: string;
  type?: string | null;
  keyLocationStatus?: string | null;
  priceLevel?: string | null;
  location?: string;
  locationRef?: string;
  gallery: PayloadGalleryItem[];
  instagramGallery?: PayloadInstagramGalleryItem[];
  address?: string;
  countryCode?: string | null;
  phoneNumber?: string | null;
  website?: string | null;
  menuUrl?: string | null;
  bookingUrl?: string | null;
  email?: string | null;
  operationHours?: {
    hours: Array<{
      day: string;
      hours: string;
    }>;
  } | null;
  countryCodeIso?: string | null;
  sourceName?: string | null;
  cuisines?: string[];
  idealFor?: string[];
  nightlifeDetails?: PayloadNightlifeDetails;
  core?: Record<string, unknown>;
  theStay?: Record<string, unknown>;
  theExperience?: Record<string, unknown>;
  theDetails?: Record<string, unknown>;
  attractionsDetails?: Record<string, unknown>;
  tours?: PayloadRelationshipId[];
  keyLocationsDetails?: Record<string, unknown>;
  ianaTimeId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  status: "draft" | "published";
}
