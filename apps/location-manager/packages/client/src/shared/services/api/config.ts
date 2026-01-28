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
export const API_ENDPOINTS = {
  // Location management
  LOCATIONS: "/api/locations",
  LOCATIONS_BASIC: "/api/locations-basic",
  GET_LOCATION_BY_ID: (id: number) => `/api/locations/${id}`,
  CREATE_LOCATION: "/api/locations",
  UPDATE_LOCATION: (id: number) => `/api/locations/${id}`,
  DELETE_LOCATION: (id: number) => `/api/locations/${id}`,
  REFETCH_PLACE_ID: (id: number) => `/api/locations/${id}/refetch-place-id`,
  ADD_INSTAGRAM: (locationId: number) => `/api/add-instagram/${locationId}`,
  DELETE_INSTAGRAM_EMBED: (embedId: number) => `/api/instagram-embeds/${embedId}`,
  ADD_UPLOAD: (locationId: number) => `/api/add-upload/${locationId}`,
  ADD_UPLOAD_IMAGESET: (locationId: number) => `/api/add-upload-imageset/${locationId}`,
  GENERATE_ALT_TEXT: "/api/generate-alt-text",
  DELETE_UPLOAD: (uploadId: number) => `/api/uploads/${uploadId}`,
  CLEAR_DB: "/api/clear-db",

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
  PAYLOAD_SYNC_ALL: "/api/payload/sync-all",
  PAYLOAD_SYNC_STATUS: "/api/payload/sync-status",
  PAYLOAD_SYNC_STATUS_BY_ID: (locationId: number) => `/api/payload/sync-status/${locationId}`,
  PAYLOAD_TEST_CONNECTION: "/api/payload/test-connection",

  // Files
  OPEN_FOLDER: "/api/open-folder",
  IMAGES: "/api/images",

  // Google Reviews
  FETCH_REVIEWS: (id: number) => `/api/locations/${id}/reviews/fetch`,
  DOWNLOAD_REVIEWS: (id: number) => `/api/locations/${id}/reviews/download`,
  REVIEWS_STATUS: (id: number) => `/api/locations/${id}/reviews/status`,

  // TripAdvisor Reviews
  FETCH_TRIPADVISOR_REVIEWS: (id: number) => `/api/locations/${id}/tripadvisor-reviews/fetch`,
  DOWNLOAD_TRIPADVISOR_REVIEWS: (id: number, lang?: string) =>
    `/api/locations/${id}/tripadvisor-reviews/download${lang ? `?lang=${lang}` : ""}`,
  TRIPADVISOR_REVIEWS_STATUS: (id: number) => `/api/locations/${id}/tripadvisor-reviews/status`,
} as const;
