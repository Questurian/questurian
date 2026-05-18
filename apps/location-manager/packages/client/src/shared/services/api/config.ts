/**
 * API configuration and constants
 */

/**
 * Base URL for API requests
 * - In development: Empty string to use Vite proxy (relative URLs)
 * - In production: Full API URL from VITE_API_BASE_URL
 */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

/**
 * API endpoint paths
 */
type Category = "dining" | "accommodations" | "attractions" | "nightlife" | "key_locations";

export const API_ENDPOINTS = {
  // Category-specific location management
  LOCATIONS: (category: Category) => `/api/${category}`,
  LOCATIONS_BASIC: (category: Category) => `/api/${category}-basic`,
  GET_LOCATION_BY_ID: (category: Category, id: number) => `/api/${category}/${id}`,
  CREATE_LOCATION: (category: Category) => `/api/${category}`,
  GOOGLE_PREFILL: (category: Category) => `/api/${category}/google-prefill`,
  FIELD_SUGGESTIONS: "/api/field-suggestions",
  DINING_STAGE2_SUGGEST: (id: number) => `/api/dining/${id}/stage2-suggest`,
  PENDING_SUGGESTION_ACCEPT: (id: number) => `/api/dining/${id}/pending-suggestions/accept`,
  PENDING_SUGGESTION_DISMISS: (id: number) => `/api/dining/${id}/pending-suggestions/dismiss`,
  UPDATE_LOCATION: (category: Category, id: number) => `/api/${category}/${id}`,
  DELETE_LOCATION: (category: Category, id: number) => `/api/${category}/${id}`,
  REFETCH_PLACE_ID: (category: Category, id: number) => `/api/${category}/${id}/refetch-place-id`,
  ADD_INSTAGRAM: (category: Category, locationId: number) => `/api/${category}/${locationId}/instagram`,
  DELETE_INSTAGRAM_EMBED: (embedId: number) => `/api/instagram-embeds/${embedId}`,
  ADD_UPLOAD: (category: Category, locationId: number) => `/api/${category}/${locationId}/uploads`,
  ADD_UPLOAD_IMAGESET: (category: Category, locationId: number) => `/api/${category}/${locationId}/uploads/imageset`,
  GENERATE_ALT_TEXT: "/api/generate-alt-text",
  GENERATE_NEIGHBORHOOD_DESCRIPTION: (category: Category, id: number) =>
    `/api/${category}/${id}/neighborhood-description/generate`,
  DELETE_UPLOAD: (uploadId: number) => `/api/uploads/${uploadId}`,
  REPROCESS_UPLOAD_VARIANTS: (uploadId: number) =>
    `/api/uploads/${uploadId}/reprocess-variants`,
  REPLACE_UPLOAD_VARIANTS: (uploadId: number) =>
    `/api/uploads/${uploadId}/replace-variants`,
  UPDATE_UPLOAD_PHOTOGRAPHER_CREDIT: (uploadId: number) =>
    `/api/uploads/${uploadId}/photographer-credit`,
  CLEAR_DB: "/api/clear-db",
  TOURS: "/api/tours",
  TOUR_BY_ID: (id: number) => `/api/tours/${id}`,
  TOUR_MEDIA_SET: "/api/tours/media-set",

  // Location hierarchy
  HIERARCHY: "/api/location-hierarchy",
  COUNTRIES: "/api/location-hierarchy/countries",
  COUNTRIES_LIST: "/api/countries",
  CITIES: (country: string) => `/api/location-hierarchy/cities/${country}`,
  NEIGHBORHOODS: (country: string, city: string) =>
    `/api/location-hierarchy/neighborhoods/${country}/${city}`,

  // Admin taxonomy management
  ADMIN_TAXONOMY_PENDING: "/api/admin/taxonomy/pending",
  ADMIN_TAXONOMY_APPROVE: (locationKey: string) => `/api/admin/taxonomy/${encodeURIComponent(locationKey)}/approve`,
  ADMIN_TAXONOMY_REJECT: (locationKey: string) => `/api/admin/taxonomy/${encodeURIComponent(locationKey)}/reject`,
  ADMIN_TAXONOMY_CORRECTIONS: "/api/admin/taxonomy/corrections",
  ADMIN_TAXONOMY_CORRECTIONS_PREVIEW: "/api/admin/taxonomy/corrections/preview",
  ADMIN_TAXONOMY_CORRECTION_DELETE: (id: number) => `/api/admin/taxonomy/corrections/${id}`,

  // Payload CMS sync
  PAYLOAD_SYNC: (locationId: number) => `/api/payload/sync/${locationId}`,
  PAYLOAD_SYNC_TOUR: (tourId: number) => `/api/payload/sync-tour/${tourId}`,
  PAYLOAD_SYNC_ALL: "/api/payload/sync-all",
  PAYLOAD_MEDIA_SETS: "/api/payload/media-sets",
  PAYLOAD_SYNC_STATUS: "/api/payload/sync-status",
  PAYLOAD_SYNC_STATUS_BY_ID: (locationId: number) => `/api/payload/sync-status/${locationId}`,
  PAYLOAD_TEST_CONNECTION: "/api/payload/test-connection",
  PAYLOAD_RESET_SYNC_STATE: "/api/payload/sync-state",

  // Files
  OPEN_FOLDER: "/api/open-folder",
  IMAGES: "/api/images",

  // TripAdvisor Place (SerpAPI) — used for Stage 1 dining auto-fill (canonical TA URL lookup)
  FETCH_TRIPADVISOR_PLACE: (category: Category, id: number) => `/api/${category}/${id}/tripadvisor-place/fetch`,
  DOWNLOAD_TRIPADVISOR_PLACE: (category: Category, id: number) => `/api/${category}/${id}/tripadvisor-place/download`,
  TRIPADVISOR_PLACE_STATUS: (category: Category, id: number) => `/api/${category}/${id}/tripadvisor-place/status`,

  // Location Export
  DOWNLOAD_LOCATION_EXPORT: (category: Category, id: number) => `/api/${category}/${id}/export`,
} as const;
