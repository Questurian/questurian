export type PayloadCollection =
  | "dining"
  | "accommodations"
  | "attractions"
  | "nightlife"
  | "key-locations";

export type PayloadMediaVariantType =
  | "thumbnail"
  | "square"
  | "wide"
  | "open_graph"
  | "editorial"
  | "portrait"
  | "hero";

export interface PayloadAuthResponse {
  message: string;
  user: {
    id: string;
    email: string;
    role: string;
  };
  token: string;
  exp: number;
}

export interface PayloadCustomAuthResponse {
  token: string;
  user?: {
    id?: string;
    email?: string;
    role?: string;
  };
}

export interface PayloadMediaAssetResponse {
  message: string;
  doc: {
    id: string;
    filename: string;
    mimeType: string;
    filesize: number;
    width: number;
    height: number;
    url: string;
    altText?: string;
    location?: string;
    createdAt: string;
    updatedAt: string;
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

export interface PayloadLocationQueryResponse {
  docs: Array<{
    id: string;
    locationKey?: string;
  }>;
  totalDocs?: number;
}

export type PayloadLocationCreateData =
  | {
      level: "country";
      country: string;
      countryName: string;
    }
  | {
      level: "city";
      country: string;
      city: string;
      countryName: string;
      cityName: string;
    }
  | {
      level: "neighborhood";
      country: string;
      city: string;
      neighborhood: string;
      countryName: string;
      cityName: string;
      neighborhoodName: string;
    };

export interface PayloadLocationCreateResponse {
  message: string;
  doc: {
    id: string;
    level: string;
    locationKey?: string;
  };
}

export interface PayloadGalleryItem {
  image: string;
  altText?: string;
  caption?: string;
}

export interface PayloadInstagramPostData {
  title: string;
  embedCode: string;
  previewImage: string;
  status: "draft" | "published";
}

export interface PayloadInstagramPostResponse {
  message: string;
  doc: {
    id: string;
    title: string;
    embedCode: string;
    previewImage: {
      id: string;
      filename: string;
      url: string;
    };
    status: "draft" | "published";
    createdAt: string;
    updatedAt: string;
  };
}

export interface PayloadInstagramGalleryItem {
  post: string;
}

export interface PayloadNightlifeDetails {
  core: {
    name: string;
    clubType: string;
    priceTier: string;
    music: string[];
    idealFor: string[];
  };
  theSpace: {
    venueType: string;
    venueSize: string;
    spaceLayout: string[];
    vibe: string[];
    peakHours: string;
  };
  theScene: {
    musicFormat: string[];
    touristPresence: string;
    dressCode: string[];
    energyLevel: string;
    vipAndBottleService: string;
    crowdProfile: string;
  };
  theDetails: {
    operationHours: Record<string, unknown>;
    reserveUrl: string;
    daytimeRestaurant: boolean;
  };
}

export interface PayloadMediaSetData {
  title: string;
  alt_text: string;
  externalRef?: string;
  location?: string;
  tags?: string[];
}

export interface PayloadMediaSetVariant {
  id: string;
  width: number;
  height: number;
}

export interface PayloadMediaSetResponse {
  message?: string;
  doc: {
    id: string;
    title: string;
    alt_text: string;
    status: "partial" | "complete";
    variants: Partial<Record<PayloadMediaVariantType, PayloadMediaSetVariant | null>>;
    externalRef?: string;
    location?: string;
    tags?: string[];
    createdAt?: string;
    updatedAt?: string;
  };
}

export interface PayloadMediaSetQueryResponse {
  docs: Array<{
    id: string;
    title: string;
    status: string;
    externalRef?: string;
  }>;
  totalDocs?: number;
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
  countryCode?: string;
  phoneNumber?: string;
  website?: string;
  email?: string;
  operationHours?: {
    hours: Array<{
      day: string;
      hours: string;
    }>;
  };
  countryCodeIso?: string;
  sourceName?: string;
  cuisines?: string[];
  idealFor?: string[];
  nightlifeDetails?: PayloadNightlifeDetails;
  core?: Record<string, unknown>;
  theStay?: Record<string, unknown>;
  theExperience?: Record<string, unknown>;
  theDetails?: Record<string, unknown>;
  attractionsDetails?: Record<string, unknown>;
  keyLocationsDetails?: Record<string, unknown>;
  ianaTimeId?: string;
  latitude?: number;
  longitude?: number;
  status: "draft" | "published";
}
