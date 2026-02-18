import { z } from "zod";
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
  SPEND_LEVEL_VALUES,
  TOURIST_PRESENCE_VALUES,
  VENUE_SIZE_VALUES,
  VENUE_TYPE_VALUES,
  VIP_BOTTLE_SERVICE_VALUES,
  VIBE_VALUES,
} from "../constants/nightlife-options";

export const addNightlifeSchema = z.object({
  name: z
    .string()
    .min(1, "Location name is required")
    .max(200, "Name must be less than 200 characters"),
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
  spendLevel: z.enum(SPEND_LEVEL_VALUES),
  dressCode: z.array(z.enum(DRESS_CODE_VALUES)).min(1, "Select at least 1 dress code option"),
  energyLevel: z.enum(ENERGY_LEVEL_VALUES),
  vipAndBottleService: z.enum(VIP_BOTTLE_SERVICE_VALUES),
  crowdProfile: z.enum(CROWD_PROFILE_VALUES),

  description: z.string().min(1, "Description is required"),
  images: z.string().optional().or(z.literal("")),
  location: z.string().min(1, "Location is required"),
  phone: z.string().optional().or(z.literal("")),
  hours: z.string().optional().or(z.literal("")),
  website: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine((value) => value == null || value === "" || /^https?:\/\//i.test(value), "Website must be a valid URL"),
  reserveUrl: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine((value) => value == null || value === "" || /^https?:\/\//i.test(value), "Reserve URL must be a valid URL"),
  daytimeRestaurant: z.enum(DAYTIME_RESTAURANT_VALUES),
});

export type AddNightlifeFormData = z.infer<typeof addNightlifeSchema>;
