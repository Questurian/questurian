export interface AccommodationsOption {
  value: string;
  label: string;
  description: string;
}

export const PRICE_VALUES = ["$", "$$", "$$$", "$$$$"] as const;
export const PRICE_OPTIONS: AccommodationsOption[] = [
  { value: "$", label: "$", description: "Budget-friendly pricing." },
  { value: "$$", label: "$$", description: "Moderate pricing tier." },
  { value: "$$$", label: "$$$", description: "Premium pricing tier." },
  { value: "$$$$", label: "$$$$", description: "Luxury pricing tier." },
];

export const PERFECT_FOR_VALUES = ["Solo", "Couples", "Groups"] as const;
export const PERFECT_FOR_OPTIONS: AccommodationsOption[] = [
  { value: "Solo", label: "Solo", description: "Optimized for solo travelers." },
  { value: "Couples", label: "Couples", description: "Designed for couples stays." },
  { value: "Groups", label: "Groups", description: "Works well for group travel." },
];

export const PARKING_VALUES = ["none", "onsite", "valet", "street", "garage"] as const;
export const PARKING_OPTIONS: AccommodationsOption[] = [
  { value: "none", label: "None", description: "No parking available." },
  { value: "onsite", label: "Onsite", description: "Parking inside the property." },
  { value: "valet", label: "Valet", description: "Valet parking service." },
  { value: "street", label: "Street", description: "Street parking nearby." },
  { value: "garage", label: "Garage", description: "Garage parking option." },
];

export const VIBE_VALUES = [
  "Luxury",
  "Social",
  "Quiet",
  "Boutique",
  "Family-Friendly",
  "Business-Friendly",
] as const;
export const VIBE_OPTIONS: AccommodationsOption[] = [
  { value: "Luxury", label: "Luxury", description: "High-end hospitality experience." },
  { value: "Social", label: "Social", description: "Lively and social atmosphere." },
  { value: "Quiet", label: "Quiet", description: "Peaceful, low-noise environment." },
  { value: "Boutique", label: "Boutique", description: "Design-led boutique feel." },
  { value: "Family-Friendly", label: "Family-Friendly", description: "Comfortable for family stays." },
  { value: "Business-Friendly", label: "Business-Friendly", description: "Optimized for business trips." },
];

export const WORKSPACE_VALUES = [
  "None",
  "Shared Lounge",
  "Dedicated Desk",
  "Co-working Space",
] as const;
export const WORKSPACE_OPTIONS: AccommodationsOption[] = [
  { value: "None", label: "None", description: "No dedicated workspace." },
  { value: "Shared Lounge", label: "Shared Lounge", description: "Common-area workspace." },
  { value: "Dedicated Desk", label: "Dedicated Desk", description: "Private or in-room desk." },
  { value: "Co-working Space", label: "Co-working Space", description: "Full co-working area." },
];

export const POOL_VALUES = ["none", "indoor", "outdoor", "rooftop", "infinity"] as const;
export const POOL_OPTIONS: AccommodationsOption[] = [
  { value: "none", label: "None", description: "No pool available." },
  { value: "indoor", label: "Indoor", description: "Indoor pool." },
  { value: "outdoor", label: "Outdoor", description: "Outdoor pool." },
  { value: "rooftop", label: "Rooftop", description: "Rooftop pool." },
  { value: "infinity", label: "Infinity", description: "Infinity-edge pool." },
];

export const JACUZZI_VALUES = ["none", "private", "shared", "rooftop"] as const;
export const JACUZZI_OPTIONS: AccommodationsOption[] = [
  { value: "none", label: "None", description: "No jacuzzi available." },
  { value: "private", label: "Private", description: "Private jacuzzi option." },
  { value: "shared", label: "Shared", description: "Shared jacuzzi option." },
  { value: "rooftop", label: "Rooftop", description: "Rooftop jacuzzi option." },
];

export const CHECK_IN_TIME_VALUES = ["12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "20:00"] as const;
export const CHECK_IN_TIME_OPTIONS: AccommodationsOption[] = [
  { value: "12:00", label: "12:00 PM", description: "Noon check-in." },
  { value: "13:00", label: "1:00 PM", description: "1 PM check-in." },
  { value: "14:00", label: "2:00 PM", description: "2 PM check-in." },
  { value: "15:00", label: "3:00 PM", description: "Standard check-in time." },
  { value: "16:00", label: "4:00 PM", description: "Late afternoon check-in." },
  { value: "17:00", label: "5:00 PM", description: "Evening check-in." },
  { value: "18:00", label: "6:00 PM", description: "Late check-in." },
  { value: "20:00", label: "8:00 PM", description: "Very late check-in." },
];

export const CHECK_OUT_TIME_VALUES = ["10:00", "11:00", "12:00", "13:00", "14:00"] as const;
export const CHECK_OUT_TIME_OPTIONS: AccommodationsOption[] = [
  { value: "10:00", label: "10:00 AM", description: "Early check-out." },
  { value: "11:00", label: "11:00 AM", description: "Standard check-out time." },
  { value: "12:00", label: "12:00 PM", description: "Noon check-out." },
  { value: "13:00", label: "1:00 PM", description: "Late check-out." },
  { value: "14:00", label: "2:00 PM", description: "Very late check-out." },
];

export const GYM_VALUES = ["None", "Basic", "Full", "24/7"] as const;
export const GYM_OPTIONS: AccommodationsOption[] = [
  { value: "None", label: "None", description: "No gym available." },
  { value: "Basic", label: "Basic", description: "Limited gym equipment." },
  { value: "Full", label: "Full", description: "Complete gym setup." },
  { value: "24/7", label: "24/7", description: "Gym is available 24/7." },
];

export const WALKABILITY_VALUES = [
  "Walkable Downtown",
  "Transit-Friendly",
  "Car Needed",
  "Secluded",
] as const;
export const WALKABILITY_OPTIONS: AccommodationsOption[] = [
  { value: "Walkable Downtown", label: "Walkable Downtown", description: "Easy to explore on foot." },
  { value: "Transit-Friendly", label: "Transit-Friendly", description: "Strong access to public transit." },
  { value: "Car Needed", label: "Car Needed", description: "Best navigated by car." },
  { value: "Secluded", label: "Secluded", description: "More private and remote setting." },
];

export const BOOLEAN_VALUES = ["yes", "no"] as const;
export const BOOLEAN_OPTIONS: AccommodationsOption[] = [
  { value: "yes", label: "Yes", description: "Enabled." },
  { value: "no", label: "No", description: "Not available." },
];

export const ACCOMMODATIONS_SUGGESTION_FIELD_KEYS = [
  "type",
  "price",
  "perfectFor",
  "kidFriendly",
  "ac",
  "wifi",
  "extraGuestFee",
  "parking",
  "breakfastServed",
  "vibe",
  "workspace",
  "restaurant",
  "pool",
  "rooftopLounge",
  "jacuzzi",
  "gym",
  "walkability",
  "checkInTime",
  "checkOutTime",
  "bookingUrl",
] as const;

export type AccommodationsSuggestionFieldKey =
  (typeof ACCOMMODATIONS_SUGGESTION_FIELD_KEYS)[number];

export type AccommodationsSuggestionKind = "single" | "multi" | "url";

export interface AccommodationsSuggestionFieldDefinition {
  key: AccommodationsSuggestionFieldKey;
  label: string;
  kind: AccommodationsSuggestionKind;
  options?: AccommodationsOption[];
}

export const ACCOMMODATIONS_SUGGESTION_FIELDS = [
  { key: "type", label: "Type", kind: "single" },
  { key: "price", label: "Price", kind: "single", options: PRICE_OPTIONS },
  { key: "perfectFor", label: "Perfect For", kind: "multi", options: PERFECT_FOR_OPTIONS },
  { key: "kidFriendly", label: "Kid Friendly", kind: "single", options: BOOLEAN_OPTIONS },
  { key: "ac", label: "AC", kind: "single", options: BOOLEAN_OPTIONS },
  { key: "wifi", label: "WiFi", kind: "single", options: BOOLEAN_OPTIONS },
  { key: "extraGuestFee", label: "Extra Adult Guest Fee", kind: "single", options: BOOLEAN_OPTIONS },
  { key: "parking", label: "Parking", kind: "multi", options: PARKING_OPTIONS },
  { key: "breakfastServed", label: "Breakfast Served", kind: "single", options: BOOLEAN_OPTIONS },
  { key: "vibe", label: "Vibe", kind: "multi", options: VIBE_OPTIONS },
  { key: "workspace", label: "Workspace", kind: "multi", options: WORKSPACE_OPTIONS },
  { key: "restaurant", label: "Restaurant", kind: "single", options: BOOLEAN_OPTIONS },
  { key: "pool", label: "Pool", kind: "multi", options: POOL_OPTIONS },
  { key: "rooftopLounge", label: "Rooftop Lounge", kind: "single", options: BOOLEAN_OPTIONS },
  { key: "jacuzzi", label: "Jacuzzi", kind: "multi", options: JACUZZI_OPTIONS },
  { key: "gym", label: "Gym", kind: "single", options: GYM_OPTIONS },
  { key: "walkability", label: "Walkability", kind: "single", options: WALKABILITY_OPTIONS },
  { key: "checkInTime", label: "Check-In Time", kind: "single", options: CHECK_IN_TIME_OPTIONS },
  { key: "checkOutTime", label: "Check-Out Time", kind: "single", options: CHECK_OUT_TIME_OPTIONS },
  { key: "bookingUrl", label: "Booking URL", kind: "url" },
] as const satisfies readonly AccommodationsSuggestionFieldDefinition[];
