export type PayloadCollection =
  | "dining"
  | "accommodations"
  | "attractions"
  | "nightlife"
  | "key-locations"
  | "tours";

export type PayloadRelationshipId = string | number;

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
  image: PayloadRelationshipId;
  altText?: string;
  caption?: string;
}

export interface PayloadInstagramPostData {
  title: string;
  embedCode: string;
  previewImage?: string;
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
  post: PayloadRelationshipId;
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
    bookingUrl: string;
    daytimeRestaurant: boolean;
  };
}

export interface PayloadMediaSetData {
  title: string;
  alt_text: string;
  photographer_credit?: string;
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
    status: "empty" | "partial" | "usable" | "complete";
    variants: Partial<Record<PayloadMediaVariantType, PayloadMediaSetVariant | null>>;
    externalRef?: string;
    location?: string;
    tags?: string[];
    createdAt?: string;
    updatedAt?: string;
  };
}

/**
 * Response shape for Questura's `POST /api/media-sets/from-source` endpoint
 * (Questura ADR 0002). Single-call MediaSet creation: source upload, variant
 * generation (focal-point biased), and assembly all happen server-side.
 */
export interface PayloadMediaSetFromSourceResponse {
  mediaSetId: number;
  sourceAssetId: number;
  variantAssetIds: Partial<Record<PayloadMediaVariantType, number>>;
}

/**
 * Optional per-variant pixel-rect override accepted by `from-source`. When
 * present, the pipeline uses this rect from the source instead of computing
 * one from the focal point. Coordinates are in source-image pixels.
 */
export interface PayloadVariantOverride {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PayloadMediaSetFromSourceData {
  title: string;
  alt_text?: string;
  photographer_credit?: string;
  location?: string;
  locationRef?: number;
  externalRef?: string;
  tags?: (string | number)[];
  focal_point?: { x: number; y: number };
  overrides?: Partial<Record<PayloadMediaVariantType, PayloadVariantOverride>>;
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

export interface PayloadMediaSetSearchQueryDoc {
  id: string | number;
  title: string;
  alt_text?: string | null;
  photographer_credit?: string | null;
  status?: string | null;
  location?: string | null;
  locationRef?: unknown;
  updatedAt?: string | null;
  variants?: Partial<
    Record<
      PayloadMediaVariantType,
      | {
          id?: string | number;
          url?: string | null;
          alt_text?: string | null;
          updatedAt?: string | null;
        }
      | null
    >
  >;
}

export interface PayloadMediaSetSearchResponse {
  docs: PayloadMediaSetSearchQueryDoc[];
  totalDocs?: number;
  totalPages?: number;
  page?: number;
  limit?: number;
  hasNextPage?: boolean;
  hasPrevPage?: boolean;
  nextPage?: number | null;
  prevPage?: number | null;
}

export interface PayloadMediaSetListItem {
  id: string;
  title: string;
  altText: string | null;
  photographerCredit: string | null;
  status: string | null;
  location: string | null;
  locationRef: string | null;
  previewUrl: string | null;
  updatedAt: string | null;
}

export interface PayloadMediaSetListResponse {
  docs: PayloadMediaSetListItem[];
  totalDocs: number;
  totalPages: number;
  page: number;
  limit: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  nextPage: number | null;
  prevPage: number | null;
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
  menuUrl?: string;
  bookingUrl?: string;
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
  tours?: PayloadRelationshipId[];
  keyLocationsDetails?: Record<string, unknown>;
  ianaTimeId?: string;
  latitude?: number;
  longitude?: number;
  status: "draft" | "published";
}

export interface PayloadTourData {
  title: string;
  img: PayloadRelationshipId;
  bookingLink: string;
  price: string;
  locationRef?: PayloadRelationshipId;
  status: "draft" | "published";
}

export interface PayloadTourResponse {
  message?: string;
  doc: {
    id: string;
    title: string;
    img?: unknown;
    bookingLink: string;
    price: string;
    locationRef?: unknown;
    status: "draft" | "published";
    createdAt?: string;
    updatedAt?: string;
  };
}
