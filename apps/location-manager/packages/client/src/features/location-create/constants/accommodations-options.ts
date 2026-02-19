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

export const PARKING_VALUES = ["onsite", "valet", "street", "garage"] as const;
export const PARKING_OPTIONS: AccommodationsOption[] = [
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

export const POOL_VALUES = ["indoor", "outdoor", "rooftop", "infinity"] as const;
export const POOL_OPTIONS: AccommodationsOption[] = [
  { value: "indoor", label: "Indoor", description: "Indoor pool." },
  { value: "outdoor", label: "Outdoor", description: "Outdoor pool." },
  { value: "rooftop", label: "Rooftop", description: "Rooftop pool." },
  { value: "infinity", label: "Infinity", description: "Infinity-edge pool." },
];

export const JACUZZI_VALUES = ["private", "shared", "rooftop"] as const;
export const JACUZZI_OPTIONS: AccommodationsOption[] = [
  { value: "private", label: "Private", description: "Private jacuzzi option." },
  { value: "shared", label: "Shared", description: "Shared jacuzzi option." },
  { value: "rooftop", label: "Rooftop", description: "Rooftop jacuzzi option." },
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

export const BOOLEAN_OPTIONS: AccommodationsOption[] = [
  { value: "yes", label: "Yes", description: "Enabled." },
  { value: "no", label: "No", description: "Not available." },
];

