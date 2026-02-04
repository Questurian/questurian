/**
 * API types matching server responses
 */

import type { ImageSet } from "@questurian/lm-shared";

export type Category = "dining" | "accommodations" | "attractions" | "nightlife";

export interface ContactInfo {
  countryCode: string;
  phoneNumber: string | null;
  website: string | null;
  email: string | null;
  contactAddress: string;
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

export interface InstagramEmbed {
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
export interface ImageSetUpload {
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
  neighborhoodDescription: string | null;
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

export interface LocationsResponse {
  locations: Location[];
  cwd: string;
}

export interface LocationBasic {
  id: number;
  name: string;
  title: string | null;
  location: string | null;
  category: Category;
  // Reviews tracking fields
  reviewsFetchedAt: string | null;
  reviewsCount: number | null;
  reviewsGoogleCount: number | null;
  reviewsTripadvisorCount: number | null;
}

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
  category: Category;
  type: string | null;
  locationKey: string | null;
  district: string | null;
  ianaTimeId: string | null;
  placeId: string | null;
  tripadvisorUrl: string | null;
  tripadvisorLocationId: string | null;
  neighborhoodDescription: string | null;
  operationHours: Record<string, unknown> | null;
  tripadvisorMealTypes: string[] | null;
  tripadvisorCuisines: string[] | null;
  tripadvisorFeatures: string[] | null;
  contact: LocationContact;
  coordinates: LocationCoordinates;
  source: LocationSource;
  instagram_embeds: InstagramEmbed[];
  uploads: Upload[];
  slug: string | null;
  // Reviews tracking fields
  reviewsFetchedAt: string | null;
  reviewsCount: number | null;
  reviewsGoogleCount: number | null;
  reviewsTripadvisorCount: number | null;
  created_at: string;
  updated_at: string;
}

export interface LocationsBasicResponse {
  locations: LocationBasic[];
}

export interface LocationEntryResponse {
  entry: Location;
}

export interface InstagramEmbedResponse {
  entry: InstagramEmbed;
}

export interface UploadResponse {
  entry: Upload;
}

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
  email?: string;
  neighborhoodDescription?: string;
  operationHours?: Record<string, unknown> | string;
  tripadvisorMealTypes?: string[] | string | null;
  tripadvisorCuisines?: string[] | string | null;
  tripadvisorFeatures?: string[] | string | null;
  placeId?: string | null;
}

export interface AddInstagramRequest {
  embedCode: string;
}

export interface OpenFolderRequest {
  folderPath: string;
}

export interface SuccessResponse {
  success: true;
  message?: string;
}

export interface Neighborhood {
  label: string;
  value: string;
}

export interface City {
  label: string;
  value: string;
  neighborhoods: Neighborhood[];
}

export interface Country {
  code: string;
  label: string;
  cities: City[];
}

export interface LocationHierarchyItem {
  id: number;
  country: string;
  city: string;
  neighborhood: string;
  locationKey: string;
}

export interface LocationHierarchyResponse {
  locations: LocationHierarchyItem[];
}

export interface CountriesResponse {
  countries: Country[];
}

export interface CitiesResponse {
  cities: City[];
}

export interface NeighborhoodsResponse {
  neighborhoods: Neighborhood[];
}

// ============================================================================
// ADMIN TAXONOMY TYPES
// ============================================================================

export interface PendingTaxonomyEntry {
  id: number;
  country: string;
  city: string | null;
  neighborhood: string | null;
  locationKey: string;
  status: 'pending' | 'approved';
  locationCount: number;
  created_at: string;
}

export interface PendingTaxonomyResponse {
  success: true;
  data: {
    entries: PendingTaxonomyEntry[];
  };
}

export interface TaxonomyEntryResponse {
  success: true;
  data: {
    entry: {
      id: number;
      country: string;
      city: string | null;
      neighborhood: string | null;
      locationKey: string;
      status: 'pending' | 'approved';
      created_at: string;
    };
  };
}

export interface TaxonomyCorrectionRequest {
  incorrect_value: string;
  correct_value: string;
  part_type: "country" | "city" | "neighborhood";
}

export interface TaxonomyCorrection extends TaxonomyCorrectionRequest {
  id: number;
  created_at: string;
}

export interface CorrectionPreview {
  pendingTaxonomyCount: number;
  pendingTaxonomySamples: string[];
  locationCount: number;
  locationSamples: Array<{
    id: number;
    name: string;
    currentKey: string;
    correctedKey: string;
  }>;
}

export interface CorrectionResult {
  correction: TaxonomyCorrection;
  updatedPendingCount: number;
  updatedLocationCount: number;
}

// ============================================================================
// REVIEWS TYPES
// ============================================================================

export interface FetchReviewsRequest {
  limit?: number;
  cursor?: string;
  translate_reviews?: boolean;
  query?: string;
  sort_by?: "most_relevant" | "newest" | "highest_ranking" | "lowest_ranking";
  fields?: string;
  region?: string;
  language?: string;
}

export interface FetchReviewsResponse {
  success: true;
  data: {
    message: string;
    reviewCount: number;
    totalReviews: number;
    hasMore: boolean;
    fetchedAt: string;
  };
}

export interface ReviewsStatusResponse {
  success: true;
  data: {
    hasReviews: boolean;
    fetchedAt: string | null;
    reviewCount: number;
    totalReviews?: number;
    rating?: number;
    businessName?: string;
  };
}

// ============================================================================
// REVIEWS PIPELINE TYPES
// ============================================================================

export type ReviewSource = "google" | "tripadvisor";

export interface FetchReviewsPipelineRequest {
  sources: ReviewSource[];
}

export interface FetchReviewsPipelineWarning {
  source: ReviewSource;
  message: string;
}

export interface ReviewsPipelineResult {
  message: string;
  selectedSources: ReviewSource[];
  fetched: {
    google?: FetchReviewsResponse["data"];
    tripadvisor?: FetchTripAdvisorReviewsResponse["data"];
  };
  merged: {
    filename: string;
    stats: MergedReviewsStats;
    rejectsReport: RejectsReportSummary | null;
  };
  warnings: FetchReviewsPipelineWarning[] | null;
}

export type ReviewsPipelineStatus = "queued" | "running" | "completed" | "failed";

export type ReviewsPipelineStep =
  | "queued"
  | "fetching_google"
  | "fetching_tripadvisor"
  | "translating_merging"
  | "completed"
  | "failed";

export interface ReviewsPipelineJobStatus {
  jobId: string;
  status: ReviewsPipelineStatus;
  step: ReviewsPipelineStep;
  progress: number;
  message: string | null;
  warnings: FetchReviewsPipelineWarning[] | null;
  result: ReviewsPipelineResult | null;
  error: string | null;
  startedAt: string;
  updatedAt: string;
}

export interface FetchReviewsPipelineStartResponse {
  success: true;
  data: {
    jobId: string;
    status: ReviewsPipelineStatus;
    step: ReviewsPipelineStep;
    progress: number;
    message: string | null;
  };
}

export interface FetchReviewsPipelineStatusResponse {
  success: true;
  data: ReviewsPipelineJobStatus;
}

// ============================================================================
// TRIPADVISOR REVIEWS TYPES
// ============================================================================

export interface FetchTripAdvisorReviewsRequest {
  /** Languages to fetch reviews for (will make separate requests per language) */
  languages: string[];
  /** Sort order for reviews */
  sort_by?: "most_recent" | "detailed_reviews";
  /** Locale for localization */
  locale?: string;
}

export interface FetchTripAdvisorReviewsResponse {
  success: true;
  data: {
    message: string;
    languages: {
      language: string;
      reviewCount: number;
      filePath: string;
    }[];
    totalReviews: number;
    locationName: string | null;
    rating: number | null;
  };
}

export interface TripAdvisorReviewsStatusResponse {
  success: true;
  data: {
    hasReviews: boolean;
    languages: {
      language: string;
      reviewCount: number;
      fetchedAt: string;
    }[];
    totalReviews: number;
    rating: number | null;
    locationName: string | null;
  };
}

// ============================================================================
// MERGED REVIEWS TYPES (translate & merge)
// ============================================================================

export interface MergedReviewsStats {
  totalReviews: number;
  googleReviews: number;
  tripadvisorReviews: number;
  translated: number;
  alreadyEnglish: number;
  errors: number;
}

export interface RejectsReportSummary {
  filename: string;
  totalRejected: number;
  replacedWithEnglish: number;
  rejectedNonEnglish: number;
}

export interface TranslateMergeReviewsResponse {
  success: true;
  data: {
    message: string;
    filename: string;
    stats: MergedReviewsStats;
    rejectsReport: RejectsReportSummary | null;
  };
}

export interface MergedReviewsStatusResponse {
  success: true;
  data: {
    hasMergedReviews: boolean;
    filename: string | null;
    mergedAt: string | null;
    stats: MergedReviewsStats | null;
  };
}

export interface MergedReviewsReportData {
  locationId: number;
  mergedAt: string;
  stats: MergedReviewsStats;
  rejectsReport: {
    totalRejected: number;
    replacedWithEnglish: number;
    rejectedNonEnglish: number;
  } | null;
}

export interface MergedReviewsReportResponse {
  success: true;
  data: MergedReviewsReportData;
}

// ============================================================================
// TRIPADVISOR PLACE TYPES (SerpAPI)
// ============================================================================

export interface FetchTripAdvisorPlaceResponse {
  success: true;
  data: {
    message: string;
    locationId: number;
    tripadvisorPlaceId: string;
    fetchedAt: string;
    placeTitle: string | null;
    rating: number | null;
    reviewCount: number | null;
  };
}

export interface TripAdvisorPlaceStatusResponse {
  success: true;
  data: {
    hasPlaceData: boolean;
    source: "database" | "file" | null;
    fetchedAt: string | null;
    tripadvisorPlaceId: string | null;
    placeTitle: string | null;
    rating: number | null;
    reviewCount: number | null;
  };
}

// ============================================================================
// LEADS API HEALTH TYPES
// ============================================================================

export interface LeadsApiHealthResponse {
  success: true;
  data: {
    healthy: boolean;
    error?: string;
  };
}
