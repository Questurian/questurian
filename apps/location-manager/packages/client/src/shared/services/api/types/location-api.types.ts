import type { Category } from "./common.types";

export interface CreateMapsRequest {
  name: string;
  address: string;
  category: Category;
  title?: string;
  url?: string;
  lat?: number;
  lng?: number;
  locationKey?: string;
  district?: string;
  contactAddress?: string;
  type?: string;
  countryCode?: string;
  ianaTimeId?: string;
  phoneNumber?: string;
  website?: string;
  email?: string;
  placeId?: string;
  tripadvisorUrl?: string;
  nightlifeDetails?: Record<string, unknown> | string;
  accommodationsDetails?: Record<string, unknown> | string;
  attractionsDetails?: Record<string, unknown> | string;
  keyLocationsDetails?: Record<string, unknown> | string;
  priceLevel?: string;
  idealFor?: string[];
  neighborhoodDescription?: string;
  operationHours?: Record<string, unknown> | string;
  tripadvisorMealTypes?: string[] | string;
  tripadvisorCuisines?: string[] | string;
  tripadvisorFeatures?: string[] | string;
  reviewsEnabled?: boolean;
}

export interface GooglePrefillRequest {
  name: string;
  address: string;
}

export interface GooglePrefillResponse {
  googleUrl: string;
  placeId: string;
  lat: number;
  lng: number;
  locationKey: string | null;
  district: string | null;
  ianaTimeId: string | null;
  phoneNumber: string | null;
  website: string | null;
  operationHours: Record<string, unknown> | null;
}

export interface UpdateMapsRequest {
  name?: string;
  address?: string;
  title?: string;
  type?: string;
  locationKey?: string;
  district?: string | null;
  contactAddress?: string | null;
  countryCode?: string;
  ianaTimeId?: string | null;
  phoneNumber?: string;
  website?: string;
  tripadvisorUrl?: string;
  idealFor?: string[];
  nightlifeDetails?: Record<string, unknown> | string | null;
  accommodationsDetails?: Record<string, unknown> | string | null;
  attractionsDetails?: Record<string, unknown> | string | null;
  keyLocationsDetails?: Record<string, unknown> | string | null;
  email?: string;
  neighborhoodDescription?: string;
  operationHours?: Record<string, unknown> | string;
  tripadvisorMealTypes?: string[] | string | null;
  tripadvisorCuisines?: string[] | string | null;
  tripadvisorFeatures?: string[] | string | null;
  priceLevel?: string | null;
  placeId?: string | null;
  reviewsEnabled?: boolean;
  autoApproveTaxonomy?: boolean;
}

export interface AddInstagramRequest {
  embedCode: string;
}

export interface OpenFolderRequest {
  folderPath: string;
}
