export const TRIPADVISOR_PLACE_MESSAGES = {
  invalidLocationId: "Invalid location ID",
  notConfigured: "SerpAPI not configured - SERPAPI_KEY missing in .env",
  locationNotFound: "Location not found",
  missingLocationId:
    "Location does not have a TripAdvisor location ID. Please add a TripAdvisor URL first to extract the location ID.",
  noPlaceDataFound: "No TripAdvisor place data found. Please fetch place data first.",
  fetchSuccess: "TripAdvisor place data fetched and saved successfully",
  fetchFailure: "Failed to fetch TripAdvisor place data",
  downloadFailure: "Failed to download TripAdvisor place data",
  exportFailure: "Failed to download location export",
  statusFailure: "Failed to load TripAdvisor place status",
} as const;

export const TRIPADVISOR_PLACE_DOWNLOAD_SUFFIXES = {
  place: "tripadvisor-place.json",
  export: "location-export.json",
} as const;
