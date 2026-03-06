import type { Review2BlogExportReview } from "./translate-merge-reviews.types";

export interface Review2BlogOperationHoursRow {
  day: string;
  hours: string;
}

export interface Review2BlogOperationHoursPayload {
  hours: Review2BlogOperationHoursRow[];
  currently_open?: boolean;
}

export interface Review2BlogEditorialPayload {
  placement_type: string;
  selection_angle: string;
  audience: string;
  tone: string;
  must_mention: string[];
  avoid: string[];
}

export interface Review2BlogLabeledValue<TValue> {
  value: TValue;
}

interface Review2BlogExportBase<TCategory extends string> {
  schemaVersion: "review2blog-export-v1";
  category: TCategory;
  name: string;
  type: string;
  district: string;
  locationKey: string;
  editorial: Review2BlogEditorialPayload;
  reviews: Review2BlogExportReview[];
  priceLevel?: string;
  idealFor?: string[];
  operationHours?: Review2BlogOperationHoursPayload;
}

export interface DiningReview2BlogExport extends Review2BlogExportBase<"dining"> {
  priceLevel: string;
  idealFor: string[];
  tripadvisorCuisines: string[];
  tripadvisorMealTypes: string[];
  tripadvisorFeatures: string[];
  operationHours: Review2BlogOperationHoursPayload;
  facts: {
    cuisines: string[];
    mealTypes: string[];
    features: string[];
    operationHours: Review2BlogOperationHoursRow[];
  };
}

export interface Review2BlogAccommodationsDetails {
  core?: {
    type: string;
    district: string;
    price: string;
  };
  the_stay: {
    perfect_for: string[];
    kid_friendly: boolean;
    wifi: boolean;
    ac: boolean;
    breakfast_served: boolean;
    parking: string[];
  };
  the_experience: {
    vibe: string[];
    workspace: string;
    pool: string[];
    rooftop_lounge: boolean;
    gym: string;
  };
  the_details: {
    walkability: string;
  };
}

export interface AccommodationsReview2BlogExport
  extends Review2BlogExportBase<"accommodations"> {
  priceLevel: string;
  idealFor: string[];
  accommodationsDetails: Review2BlogAccommodationsDetails;
  facts: {
    perfectFor: string[];
    kidFriendly: boolean;
    wifi: boolean;
    ac: boolean;
    breakfastServed: boolean;
    parking: string[];
    vibe: string[];
    workspace: string;
    pool: string[];
    rooftopLounge: boolean;
    gym: string;
    walkability: string;
  };
}

export interface Review2BlogAttractionsDetails {
  core: {
    attraction_type: string;
    pricing: string;
    district?: string;
    location_key?: string;
  };
  visit: {
    booking_required: boolean;
    ideal_for?: string[];
    hours?: Review2BlogOperationHoursPayload;
  };
}

export interface AttractionsReview2BlogExport extends Review2BlogExportBase<"attractions"> {
  priceLevel: string;
  idealFor: string[];
  attractionsDetails: Review2BlogAttractionsDetails;
  operationHours: Review2BlogOperationHoursPayload;
  facts: {
    attractionType: string;
    pricing: string;
    bookingRequired: boolean;
    idealFor: string[];
    operationHours: Review2BlogOperationHoursRow[];
  };
}

export interface Review2BlogNightlifeDetails {
  club_type?: string;
  price_tier: string;
  music: string[];
  details: {
    theSpace: {
      venueType: Review2BlogLabeledValue<string>;
      venueSize: Review2BlogLabeledValue<string>;
      vibe: Review2BlogLabeledValue<string[]>;
      peakHours: Review2BlogLabeledValue<string>;
    };
    theScene: {
      dressCode: Review2BlogLabeledValue<string[]>;
      energyLevel: Review2BlogLabeledValue<string>;
      crowdProfile: Review2BlogLabeledValue<string>;
      touristPresence?: Review2BlogLabeledValue<string>;
    };
  };
  core?: {
    clubType: string;
    priceTier: string;
    idealFor: string[];
    music: string[];
  };
}

export interface NightlifeReview2BlogExport extends Review2BlogExportBase<"nightlife"> {
  priceLevel?: string;
  idealFor: string[];
  nightlifeDetails: Review2BlogNightlifeDetails;
  operationHours: Review2BlogOperationHoursPayload;
  facts: {
    clubType: string;
    priceTier: string;
    music: string[];
    venueType: string;
    venueSize: string;
    vibe: string[];
    peakHours: string;
    dressCode: string[];
    energyLevel: string;
    crowdProfile: string;
    touristPresence: string;
    operationHours: Review2BlogOperationHoursRow[];
  };
}

export interface Review2BlogKeyLocationsDetails {
  location_type: string;
  neighborhood: string;
  status: string;
  location_key?: string;
}

export interface KeyLocationsReview2BlogExport
  extends Review2BlogExportBase<"key_locations"> {
  priceLevel?: string;
  idealFor?: string[];
  keyLocationsDetails: Review2BlogKeyLocationsDetails;
  operationHours: Review2BlogOperationHoursPayload;
  facts: {
    locationType: string;
    neighborhood: string;
    status: string;
    operationHours: Review2BlogOperationHoursRow[];
  };
}

export type Review2BlogExportPayload =
  | DiningReview2BlogExport
  | AccommodationsReview2BlogExport
  | AttractionsReview2BlogExport
  | NightlifeReview2BlogExport
  | KeyLocationsReview2BlogExport;

export type AiJsonPayload = Review2BlogExportPayload;

export interface FetchTripAdvisorPlacePayload {
  message: string;
  locationId: number;
  tripadvisorPlaceId: string;
  fetchedAt: string;
  placeTitle: string | null;
  rating: number | null;
  reviewCount: number | null;
}

export interface JsonDownloadPayload {
  filename: string;
  content: string;
}

export interface TripAdvisorPlaceStatusPayload {
  hasPlaceData: boolean;
  source: "database" | "file" | null;
  fetchedAt: string | null;
  tripadvisorPlaceId: string | null;
  placeTitle: string | null;
  rating: number | null;
  reviewCount: number | null;
}
