import type { IdealForTag } from "@shared/types/location-ideal-for";
import type { Category } from "./common.types";

export interface CreateMapsRequest {
  name: string;
  address: string;
  category: Category;
  type?: string;
  locationKey?: string;
  title?: string;
  contactAddress?: string;
  countryCode?: string;
  phoneNumber?: string;
  website?: string;
  tripadvisorUrl?: string;
  idealFor: IdealForTag[];
  email?: string;
  neighborhoodDescription?: string;
  operationHours?: Record<string, unknown> | string;
  tripadvisorMealTypes?: string[] | string;
  tripadvisorCuisines?: string[] | string;
  tripadvisorFeatures?: string[] | string;
}

export interface UpdateMapsRequest {
  name?: string;
  address?: string;
  title?: string;
  category?: Category;
  type?: string;
  locationKey?: string;
  district?: string | null;
  contactAddress?: string | null;
  countryCode?: string;
  ianaTimeId?: string | null;
  phoneNumber?: string;
  website?: string;
  tripadvisorUrl?: string;
  idealFor?: IdealForTag[];
  email?: string;
  neighborhoodDescription?: string;
  operationHours?: Record<string, unknown> | string;
  tripadvisorMealTypes?: string[] | string | null;
  tripadvisorCuisines?: string[] | string | null;
  tripadvisorFeatures?: string[] | string | null;
  priceLevel?: string | null;
  placeId?: string | null;
}

export interface AddInstagramRequest {
  embedCode: string;
}

export interface OpenFolderRequest {
  folderPath: string;
}
