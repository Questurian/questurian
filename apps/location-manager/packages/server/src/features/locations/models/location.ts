export type LocationCategory = 'dining' | 'accommodations' | 'attractions' | 'nightlife' | 'key_locations';

/** Last Payload `tours` doc sync for this LM row (from `tour_payload_sync_state`). */
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
  /** Pipe-delimited taxonomy key; synced to Payload `tours.locationRef` → `locations`. */
  locationKey: string | null;
  created_at: string;
  updated_at: string;
  payloadSync?: TourPayloadSyncSummary | null;
}

export interface TourPayloadSyncState {
  id: number;
  tourId: number;
  payloadDocId: string;
  lastSyncedAt: string;
  syncStatus: "success" | "failed" | "pending";
  errorMessage: string | null;
}

// Hierarchical Location Taxonomy Types
export interface NeighborhoodData {
  label: string;
  value: string;
}

export interface CityData {
  label: string;
  value: string;
  neighborhoods: NeighborhoodData[];
}

export interface CountryData {
  code: string;
  label: string;
  cities: CityData[];
}

export interface LocationHierarchy {
  id?: number;
  country: string;
  city: string | null;
  neighborhood: string | null;
  locationKey: string; // Pipe-delimited: "colombia|bogota|chapinero"
  status?: 'approved' | 'pending';
  created_at?: string;
}

/**
 * Location
 * Represents actual physical locations (restaurants, attractions, etc.)
 */
export interface Location {
  id?: number;
  name: string;
  title?: string | null;
  address: string;
  url: string;
  lat?: number | null;
  lng?: number | null;
  category?: LocationCategory;
  type?: string | null;
  locationKey?: string | null;
  district?: string | null;
  contactAddress?: string | null;
  countryCode?: string | null;
  ianaTimeId?: string | null;
  phoneNumber?: string | null;
  website?: string | null;
  menuUrl?: string | null;
  reservationUrl?: string | null;
  email?: string | null;
  hoursJson?: string | null;
  neighborhoodDescription?: string | null;
  idealForJson?: string | null;
  nightlifeDetailsJson?: string | null;
  accommodationsDetailsJson?: string | null;
  attractionsDetailsJson?: string | null;
  keyLocationsDetailsJson?: string | null;
  tripadvisorMealTypesJson?: string | null;
  tripadvisorCuisinesJson?: string | null;
  tripadvisorFeaturesJson?: string | null;
  priceLevel?: string | null;
  slug?: string | null;
  placeId?: string | null;  // Google Place ID
  tripadvisorUrl?: string | null;
  tripadvisorLocationId?: string | null;
  payload_location_ref?: string | null;  // Payload CMS location hierarchy ID
  selectedPayloadMediaSetIdsJson?: string | null;
  provenanceJson?: string | null;        // ADR-0002 sidecar: per-field provenance map
  pendingSuggestionsJson?: string | null; // ADR-0002 side channel: AI re-suggestions for operator-touched fields
  tours?: Tour[];
  created_at?: string;
  updated_at?: string;
}

/**
 * Instagram Embed
 * Represents Instagram posts embedded for a location
 */
export interface InstagramEmbed {
  id?: number;
  location_id: number;  // FK to locations table
  username: string;
  url: string;
  embed_code: string;
  instagram?: string | null;  // Instagram profile URL
  images?: string[];
  original_image_urls?: string[];
  created_at?: string;
}

/**
 * Image Metadata
 * File information for uploaded images
 */
export interface ImageMetadata {
  width: number;
  height: number;
  size: number; // bytes
  format: string; // 'jpeg', 'png', 'webp', 'gif'
}

/**
 * ImageSet Upload (multi-variant system)
 * Represents the multi-variant upload format with ImageSet structure
 */
export interface ImageSetUpload {
  id?: number;
  location_id: number;  // FK to locations table
  imageSet?: import('@questurian/lm-shared').ImageSet;  // Single ImageSet object
  created_at?: string;
  format: 'imageset';  // Format discriminator
}

/**
 * Upload type - now only supports ImageSet format
 */
export type Upload = ImageSetUpload;

/**
 * Location with nested children (API response type)
 */
export interface LocationWithNested extends Location {
  instagram_embeds?: InstagramEmbed[];
  uploads?: Upload[];
  tours?: Tour[];
}

export interface CreateMapsRequest {
  name: string;
  address: string;
  category: LocationCategory;
  title?: string;
  url?: string;
  lat?: number;
  lng?: number;
  locationKey?: string;
  district?: string;
  contactAddress?: string;
  countryCode?: string;
  ianaTimeId?: string;
  placeId?: string;
  phoneNumber?: string;
  website?: string;
  menuUrl?: string;
  reservationUrl?: string;
  idealFor?: string[];
  type?: string;
  tripadvisorUrl?: string;
  email?: string;
  neighborhoodDescription?: string;
  selectedPayloadMediaSetIds?: string[] | null;
  nightlifeDetails?: Record<string, unknown> | string;
  accommodationsDetails?: Record<string, unknown> | string;
  attractionsDetails?: Record<string, unknown> | string;
  keyLocationsDetails?: Record<string, unknown> | string;
  priceLevel?: string;
  operationHours?: Record<string, unknown> | string;
  tripadvisorMealTypes?: string[] | string;
  tripadvisorCuisines?: string[] | string;
  tripadvisorFeatures?: string[] | string;
  tourIds?: number[];
  provenance?: Record<string, string>;   // ADR-0002 sidecar: field name → FieldProvenance
}


export interface AddInstagramRequest {
  embedCode: string;
  locationId: number;
}

/**
 * API Response Types - Nested structure for external consumption
 */
export interface LocationContact {
  countryCode: string | null;
  phoneNumber: string | null;
  website: string | null;
  email: string | null;
  contactAddress: string | null;
  url: string;
}

export interface LocationCoordinates {
  lat: number | null;
  lng: number | null;
}

export interface LocationSource {
  name: string;
  address: string;
}

export interface LocationResponse {
  id: number;
  title: string | null;
  category: LocationCategory;
  type: string | null;
  locationKey: string | null;
  district: string | null;
  ianaTimeId: string | null;
  placeId: string | null;
  tripadvisorUrl: string | null;
  tripadvisorLocationId: string | null;
  menuUrl: string | null;
  reservationUrl: string | null;
  payload_location_ref: string | null;
  selectedPayloadMediaSetIds: string[] | null;
  tourIds: number[] | null;
  tours: Tour[];
  neighborhoodDescription: string | null;
  idealFor: string[] | null;
  nightlifeDetails: Record<string, unknown> | null;
  accommodationsDetails: Record<string, unknown> | null;
  attractionsDetails: Record<string, unknown> | null;
  keyLocationsDetails: Record<string, unknown> | null;
  operationHours: Record<string, unknown> | null;
  tripadvisorMealTypes: string[] | null;
  tripadvisorCuisines: string[] | null;
  tripadvisorFeatures: string[] | null;
  priceLevel: string | null;
  contact: LocationContact;
  coordinates: LocationCoordinates;
  source: LocationSource;
  instagram_embeds: InstagramEmbed[];
  uploads: Upload[];
  slug: string | null;
  provenance: Record<string, string> | null;
  pendingSuggestions: Record<string, { value: string | string[]; provenance: string }> | null;
  created_at: string;
  updated_at: string;
}

/**
 * Basic location info for lightweight API responses
 */
export interface LocationBasic {
  id: number;
  name: string;
  title: string | null;
  location: string | null;
  locationKey: string | null;
  country: string | null;
  category: LocationCategory;
  type: string | null;
  isComplete: boolean;
}
