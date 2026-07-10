import type { ImageSet, InstagramMediaStagingFields, StagedSourceFields } from "@questurian/lm-shared";
import type { Category } from "./common.types";

export interface ContactInfo {
  countryCode: string | null;
  phoneNumber: string | null;
  /** Operator confirmed this place has no phone; completeness treats it as satisfied. */
  phoneUnavailable: boolean;
  website: string | null;
  email: string | null;
  contactAddress: string | null;
  url: string;
}

export interface Coordinates {
  lat: number | null;
  lng: number | null;
}

export interface SourceInfo {
  name: string;
  address: string;
}

export interface TourPayloadSyncSummary {
  payloadDocId: string | null;
  lastSyncedAt: string | null;
  syncStatus: "success" | "failed" | "pending";
  errorMessage: string | null;
}

export interface Tour {
  id: number;
  title: string;
  imgPayloadMediaSetId: string;
  bookingLink: string;
  price: string;
  /** Pipe taxonomy key; synced to Payload `tours.locationRef` when set. */
  locationKey: string | null;
  sourceProvider: string | null;
  sourceUrl: string | null;
  sourceTitle: string | null;
  sourceImageUrl: string | null;
  sourceProductCode: string | null;
  created_at: string;
  updated_at: string;
  payloadSync?: TourPayloadSyncSummary | null;
}

export interface InstagramEmbed extends InstagramMediaStagingFields {
  id?: number;
  location_id: number;
  username: string;
  url: string;
  embed_code: string;
  instagram?: string | null;
  images?: string[];
  original_image_urls?: string[];
  created_at?: string;
}

export interface ImageMetadata {
  width: number;
  height: number;
  size: number; // bytes
  format: string; // 'jpeg', 'png', 'webp', 'gif'
}

// ImageSet Upload format (multi-variant system)
export interface ImageSetUpload extends StagedSourceFields {
  id?: number;
  location_id: number;
  imageSet?: ImageSet;
  created_at?: string;
  format: 'imageset';
}

// Upload type - now only supports ImageSet format
export type Upload = ImageSetUpload;

export interface Location {
  id: number;
  title: string | null;
  category: Category;
  type: string | null;
  locationKey: string;
  ianaTimeId: string | null;
  tripadvisorUrl: string | null;
  tripadvisorLocationId: string | null;
  menuUrl: string | null;
  bookingUrl: string | null;
  nightlifeDetails: Record<string, unknown> | null;
  accommodationsDetails: Record<string, unknown> | null;
  attractionsDetails: Record<string, unknown> | null;
  keyLocationsDetails: Record<string, unknown> | null;
  neighborhoodDescription: string | null;
  idealFor: string[] | null;
  operationHours: Record<string, unknown> | null;
  tripadvisorMealTypes: string[] | null;
  tripadvisorCuisines: string[] | null;
  tripadvisorFeatures: string[] | null;
  contact: ContactInfo;
  coordinates: Coordinates;
  source: SourceInfo;
  instagram_embeds: InstagramEmbed[];
  uploads: Upload[];
  slug: string | null;
  created_at: string;
  updated_at: string;
}

export interface LocationBasic {
  id: number;
  name: string;
  title: string | null;
  location: string | null;
  locationKey: string | null;
  country: string | null;
  category: Category;
  type: string | null;
  isComplete: boolean;
}

export interface LocationResponse {
  id: number;
  title: string | null;
  category: Category;
  type: string | null;
  locationKey: string | null;
  district: string | null;
  ianaTimeId: string | null;
  placeId: string | null;
  tripadvisorUrl: string | null;
  tripadvisorLocationId: string | null;
  menuUrl: string | null;
  bookingUrl: string | null;
  payload_location_ref: string | null;
  selectedPayloadMediaSetIds: string[] | null;
  tourIds: number[] | null;
  tours: Tour[];
  nightlifeDetails: Record<string, unknown> | null;
  accommodationsDetails: Record<string, unknown> | null;
  attractionsDetails: Record<string, unknown> | null;
  keyLocationsDetails: Record<string, unknown> | null;
  neighborhoodDescription: string | null;
  idealFor: string[] | null;
  operationHours: Record<string, unknown> | null;
  tripadvisorMealTypes: string[] | null;
  tripadvisorCuisines: string[] | null;
  tripadvisorFeatures: string[] | null;
  priceLevel: string | null;
  contact: ContactInfo;
  coordinates: Coordinates;
  source: SourceInfo;
  instagram_embeds: InstagramEmbed[];
  uploads: Upload[];
  slug: string | null;
  provenance: Record<string, string> | null;
  pendingSuggestions: Record<string, { value: string | string[]; provenance: string }> | null;
  created_at: string;
  updated_at: string;
}

export interface LocationsResponse {
  locations: Location[];
  cwd: string;
}

export interface LocationsBasicResponse {
  locations: LocationBasic[];
}

export interface LocationEntryResponse {
  entry: LocationResponse;
}

export interface InstagramEmbedResponse {
  entry: InstagramEmbed;
}

export interface UploadResponse {
  entry: Upload;
}
