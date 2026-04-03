import { z } from "zod";
import { NIGHTLIFE_IDEAL_FOR_TAGS } from "@questurian/lm-shared";
import {
  CLUB_TYPE_VALUES,
  CROWD_PROFILE_VALUES,
  DAYTIME_RESTAURANT_VALUES,
  DRESS_CODE_VALUES,
  ENERGY_LEVEL_VALUES,
  MUSIC_FORMAT_VALUES,
  MUSIC_VALUES,
  PEAK_HOURS_VALUES,
  PRICE_TIER_VALUES,
  SPACE_LAYOUT_VALUES,
  TOURIST_PRESENCE_VALUES,
  VENUE_SIZE_VALUES,
  VENUE_TYPE_VALUES,
  VIP_BOTTLE_SERVICE_VALUES,
  VIBE_VALUES,
} from "../constants/nightlife-options";

export const SUPPORTED_COUNTRY_CODES = ["PE", "CO", "BR"] as const;

export const addNightlifeSchema = z.object({
  name: z
    .string()
    .min(1, "Location name is required")
    .max(200, "Name must be less than 200 characters"),
  idealFor: z
    .array(z.enum(NIGHTLIFE_IDEAL_FOR_TAGS))
    .min(1, "Select at least 1 Ideal For tag")
    .max(4, "Select up to 4 Ideal For tags")
    .refine((tags) => new Set(tags).size === tags.length, {
      message: "Ideal For tags must be unique",
    }),
  priceTier: z.enum(PRICE_TIER_VALUES),
  clubType: z.enum(CLUB_TYPE_VALUES),
  music: z.array(z.enum(MUSIC_VALUES)).min(1, "Select at least 1 music option"),

  venueType: z.enum(VENUE_TYPE_VALUES),
  venueSize: z.enum(VENUE_SIZE_VALUES),
  spaceLayout: z.array(z.enum(SPACE_LAYOUT_VALUES)).min(1, "Select at least 1 layout option"),
  vibe: z.array(z.enum(VIBE_VALUES)).min(1, "Select at least 1 vibe option"),
  peakHours: z.enum(PEAK_HOURS_VALUES),
  touristPresence: z.enum(TOURIST_PRESENCE_VALUES),

  musicFormat: z.array(z.enum(MUSIC_FORMAT_VALUES)).min(1, "Select at least 1 music format option"),
  dressCode: z.array(z.enum(DRESS_CODE_VALUES)).min(1, "Select at least 1 dress code option"),
  energyLevel: z.enum(ENERGY_LEVEL_VALUES),
  vipAndBottleService: z.enum(VIP_BOTTLE_SERVICE_VALUES),
  crowdProfile: z.enum(CROWD_PROFILE_VALUES),
  countryCode: z.enum(SUPPORTED_COUNTRY_CODES),

  location: z.string().min(1, "Location is required"),
  phone: z.string().trim().min(1, "Phone number is required"),
  hours: z.string().optional().or(z.literal("")),
  tripadvisorUrl: z
    .string()
    .trim()
    .url("TripAdvisor URL must be a valid URL")
    .optional()
    .or(z.literal(""))
    .transform((value) => (value === "" ? undefined : value)),
  website: z
    .string()
    .trim()
    .min(1, "Website is required")
    .refine((value) => /^https?:\/\//i.test(value), "Website must be a valid URL"),
  reserveUrl: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine(
      (value) => value == null || value === "" || /^https?:\/\//i.test(value),
      "Reservations URL must be a valid URL"
    ),
  district: z.string().optional().or(z.literal("")),
  locationKey: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine(
      (value) =>
        value == null ||
        value === "" ||
        /^[a-z0-9-]+(\|[a-z0-9-]+){0,2}$/.test(value),
      "Location Key must be lowercase kebab-case (country|city|neighborhood)"
    ),
  ianaTimeId: z.string().optional().or(z.literal("")),
  placeId: z.string().optional().or(z.literal("")),
  googleUrl: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine((value) => value == null || value === "" || /^https?:\/\//i.test(value), "Google URL must be a valid URL"),
  latitude: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine(
      (value) => value == null || value === "" || (!Number.isNaN(Number(value)) && Number(value) >= -90 && Number(value) <= 90),
      "Latitude must be a number between -90 and 90"
    ),
  longitude: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine(
      (value) => value == null || value === "" || (!Number.isNaN(Number(value)) && Number(value) >= -180 && Number(value) <= 180),
      "Longitude must be a number between -180 and 180"
    ),
  daytimeRestaurant: z.enum(DAYTIME_RESTAURANT_VALUES),
});

export type AddNightlifeFormData = z.infer<typeof addNightlifeSchema>;
