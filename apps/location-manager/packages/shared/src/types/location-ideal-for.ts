import type { LocationCategory } from "./location-category";

export const DINING_IDEAL_FOR_TAGS = [
  "Large Groups & Parties",
  "Birthdays & Celebrations",
  "Breakfast",
  "Brunch",
  "BYOB-Friendly",
  "Casual Dining",
  "Budget-Friendly",
  "Classic & Traditional",
  "Coffee & Light Bites",
  "Business Dining",
  "Date Nights",
  "Afternoon & Daytime Drinks",
  "Solo Dining",
  "Family-Friendly",
  "Tapas & Small Plates",
  "Craft Beer",
  "Craft Cocktails",
  "Wine Bars",
  "Bar Seating",
  "Trendy Hot Spots",
  "Fine Dining",
  "First Dates",
  "Happy Hour",
  "Impressing Visitors",
  "Healthy Eating",
  "Late-Night & Party Scene",
  "Live Music",
  "Lunch",
  "Pre-Theater",
  "Private Dining",
  "Catch-Up Conversations",
  "Friends' Night Out",
  "Late-Night Cravings",
  "Takeout & Delivery",
  "Outdoor Seating",
  "Special Occasions",
  "Experiential Dining",
  "Walk-In Friendly",
  "Sports Bar",
] as const;

export const NIGHTLIFE_IDEAL_FOR_TAGS = [
  "Friends' Night Out",
  "Late-Night & Party Scene",
  "Live Music",
  "Craft Cocktails",
  "Trendy Hot Spots",
  "Date Nights",
  "Birthdays & Celebrations",
  "Sports Bar",
  "Bar Seating",
  "Outdoor Seating",
  "Solo Night Out",
  "Budget-Friendly",
] as const;

export const ACCOMMODATIONS_IDEAL_FOR_TAGS = [
  "Families",
  "Couples",
  "Solo Travelers",
  "Digital Nomads",
  "Business Travelers",
  "Budget Travelers",
  "Luxury Travelers",
  "Long Stays",
  "Weekend Getaways",
  "Groups",
  "Wellness Travelers",
  "First-Time Visitors",
] as const;

export const ATTRACTIONS_IDEAL_FOR_TAGS = [
  "Families",
  "Solo",
  "Couples",
  "Budget Travelers",
  "History Buffs",
  "Rainy Day",
  "Nature Lovers",
  "Outdoor Lovers",
  "Culture Seekers",
  "First-Time Visitors",
  "Photography Spots",
  "Kid-Friendly",
] as const;

export const KEY_LOCATIONS_IDEAL_FOR_TAGS = [
  "First-Time Visitors",
  "Airport Transfers",
  "Intercity Travel",
  "Late Arrivals",
  "Early Departures",
  "Transit Connections",
  "Currency Exchange",
  "Bus Travelers",
] as const;

export type DiningIdealForTag = typeof DINING_IDEAL_FOR_TAGS[number];
export type NightlifeIdealForTag = typeof NIGHTLIFE_IDEAL_FOR_TAGS[number];
export type AccommodationsIdealForTag = typeof ACCOMMODATIONS_IDEAL_FOR_TAGS[number];
export type AttractionsIdealForTag = typeof ATTRACTIONS_IDEAL_FOR_TAGS[number];
export type KeyLocationsIdealForTag = typeof KEY_LOCATIONS_IDEAL_FOR_TAGS[number];
export type AnyIdealForTag =
  | DiningIdealForTag
  | NightlifeIdealForTag
  | AccommodationsIdealForTag
  | AttractionsIdealForTag
  | KeyLocationsIdealForTag;

export interface IdealForTagGroup<TTag extends string = string> {
  label: string;
  tags: readonly TTag[];
}

export const IDEAL_FOR_TAGS_BY_CATEGORY = {
  dining: DINING_IDEAL_FOR_TAGS,
  nightlife: NIGHTLIFE_IDEAL_FOR_TAGS,
  accommodations: ACCOMMODATIONS_IDEAL_FOR_TAGS,
  attractions: ATTRACTIONS_IDEAL_FOR_TAGS,
  key_locations: KEY_LOCATIONS_IDEAL_FOR_TAGS,
} as const satisfies Record<LocationCategory, readonly string[]>;

export const IDEAL_FOR_TAG_GROUPS_BY_CATEGORY = {
  dining: [
    {
      label: "Occasions & Company",
      tags: [
        "Birthdays & Celebrations",
        "Business Dining",
        "Date Nights",
        "Family-Friendly",
        "First Dates",
        "Impressing Visitors",
        "Large Groups & Parties",
        "Pre-Theater",
        "Private Dining",
        "Catch-Up Conversations",
        "Friends' Night Out",
        "Solo Dining",
        "Special Occasions",
      ],
    },
    {
      label: "Meal Moments",
      tags: [
        "Afternoon & Daytime Drinks",
        "Breakfast",
        "Brunch",
        "Coffee & Light Bites",
        "Happy Hour",
        "Late-Night & Party Scene",
        "Late-Night Cravings",
        "Lunch",
      ],
    },
    {
      label: "Dining Style",
      tags: [
        "Budget-Friendly",
        "Casual Dining",
        "Classic & Traditional",
        "Experiential Dining",
        "Fine Dining",
        "Healthy Eating",
        "Tapas & Small Plates",
      ],
    },
    {
      label: "Drinks & Nightlife",
      tags: [
        "Craft Beer",
        "Craft Cocktails",
        "Live Music",
        "Sports Bar",
        "Trendy Hot Spots",
        "Wine Bars",
      ],
    },
    {
      label: "Service & Atmosphere",
      tags: [
        "BYOB-Friendly",
        "Bar Seating",
        "Outdoor Seating",
        "Takeout & Delivery",
        "Walk-In Friendly",
      ],
    },
  ] satisfies readonly IdealForTagGroup<DiningIdealForTag>[],
  nightlife: [
    {
      label: "Vibe & Social",
      tags: [
        "Friends' Night Out",
        "Late-Night & Party Scene",
        "Live Music",
        "Trendy Hot Spots",
        "Solo Night Out",
      ],
    },
    {
      label: "Occasions",
      tags: [
        "Date Nights",
        "Birthdays & Celebrations",
      ],
    },
    {
      label: "Drinks & Setting",
      tags: [
        "Craft Cocktails",
        "Sports Bar",
        "Bar Seating",
        "Outdoor Seating",
        "Budget-Friendly",
      ],
    },
  ] satisfies readonly IdealForTagGroup<NightlifeIdealForTag>[],
  accommodations: [
    {
      label: "Traveler Type",
      tags: [
        "Families",
        "Couples",
        "Solo Travelers",
        "Digital Nomads",
        "Business Travelers",
        "Budget Travelers",
        "Luxury Travelers",
      ],
    },
    {
      label: "Trip Pattern",
      tags: [
        "Long Stays",
        "Weekend Getaways",
        "Groups",
        "First-Time Visitors",
      ],
    },
    {
      label: "Experience",
      tags: [
        "Wellness Travelers",
      ],
    },
  ] satisfies readonly IdealForTagGroup<AccommodationsIdealForTag>[],
  attractions: [
    {
      label: "Audience",
      tags: [
        "Families",
        "Solo",
        "Couples",
        "Kid-Friendly",
        "First-Time Visitors",
      ],
    },
    {
      label: "Interests",
      tags: [
        "History Buffs",
        "Culture Seekers",
        "Nature Lovers",
        "Outdoor Lovers",
        "Photography Spots",
      ],
    },
    {
      label: "Practical",
      tags: [
        "Budget Travelers",
        "Rainy Day",
      ],
    },
  ] satisfies readonly IdealForTagGroup<AttractionsIdealForTag>[],
  key_locations: [
    {
      label: "Arrival & Departure",
      tags: [
        "First-Time Visitors",
        "Late Arrivals",
        "Early Departures",
        "Airport Transfers",
      ],
    },
    {
      label: "Transit",
      tags: [
        "Intercity Travel",
        "Transit Connections",
        "Bus Travelers",
      ],
    },
    {
      label: "Essential Services",
      tags: [
        "Currency Exchange",
      ],
    },
  ] satisfies readonly IdealForTagGroup<KeyLocationsIdealForTag>[],
} as const satisfies Record<LocationCategory, readonly IdealForTagGroup[]>;

export function getIdealForTags<C extends LocationCategory>(
  category: C
): (typeof IDEAL_FOR_TAGS_BY_CATEGORY)[C] {
  return IDEAL_FOR_TAGS_BY_CATEGORY[category];
}

export function getIdealForGroups<C extends LocationCategory>(
  category: C
): (typeof IDEAL_FOR_TAG_GROUPS_BY_CATEGORY)[C] {
  return IDEAL_FOR_TAG_GROUPS_BY_CATEGORY[category];
}

export function isValidIdealForTag(category: LocationCategory, tag: string): tag is AnyIdealForTag {
  return getIdealForTags(category).includes(tag as never);
}

// Backward-compatible alias for callsites gradually migrating to category-specific tags.
export type IdealForTag = AnyIdealForTag;

// Backward-compatible exports for legacy callsites that still import shared constants.
export const IDEAL_FOR_TAGS = Array.from(
  new Set(
    Object.values(IDEAL_FOR_TAGS_BY_CATEGORY).flatMap((tags) => Array.from(tags))
  )
) as AnyIdealForTag[];

export const IDEAL_FOR_TAG_GROUPS = IDEAL_FOR_TAG_GROUPS_BY_CATEGORY.dining;
