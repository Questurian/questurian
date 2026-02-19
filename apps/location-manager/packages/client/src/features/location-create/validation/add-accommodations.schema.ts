import { z } from "zod";
import {
  GYM_VALUES,
  JACUZZI_VALUES,
  PARKING_VALUES,
  PERFECT_FOR_VALUES,
  POOL_VALUES,
  PRICE_VALUES,
  VIBE_VALUES,
  WALKABILITY_VALUES,
  WORKSPACE_VALUES,
} from "../constants/accommodations-options";

const YES_NO_VALUES = ["yes", "no"] as const;

function validateLatitude(value: string) {
  const parsed = Number(value);
  return !Number.isNaN(parsed) && parsed >= -90 && parsed <= 90;
}

function validateLongitude(value: string) {
  const parsed = Number(value);
  return !Number.isNaN(parsed) && parsed >= -180 && parsed <= 180;
}

function validateTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function normalizeAccommodationsAddress(address: string) {
  return address.trim();
}

export function buildAccommodationsPrefillSignature(name: string, address: string) {
  return `${name.trim().toLowerCase()}|${normalizeAccommodationsAddress(address).toLowerCase()}`;
}

export const addAccommodationsSchema = z.object({
  name: z.string().trim().min(1, "Location name is required").max(200, "Name must be less than 200 characters"),
  address: z.string().trim().min(1, "Address is required").max(500, "Address must be less than 500 characters"),

  type: z.string().trim().optional().or(z.literal("")).transform((value) => (value === "" ? undefined : value)),
  price: z.enum(PRICE_VALUES),

  perfectFor: z.array(z.enum(PERFECT_FOR_VALUES)).min(1, "Select at least 1 perfect-for option"),
  kidFriendly: z.enum(YES_NO_VALUES),
  ac: z.enum(YES_NO_VALUES),
  wifi: z.enum(YES_NO_VALUES),
  extraGuestFee: z.enum(YES_NO_VALUES),
  parking: z.array(z.enum(PARKING_VALUES)).min(1, "Select at least 1 parking option"),
  breakfastServed: z.enum(YES_NO_VALUES),

  vibe: z.array(z.enum(VIBE_VALUES)).min(1, "Select at least 1 vibe option"),
  workspace: z.enum(WORKSPACE_VALUES),
  restaurant: z.enum(YES_NO_VALUES),
  pool: z.array(z.enum(POOL_VALUES)).min(1, "Select at least 1 pool option"),
  rooftopLounge: z.enum(YES_NO_VALUES),
  jacuzzi: z.array(z.enum(JACUZZI_VALUES)).min(1, "Select at least 1 jacuzzi option"),
  gym: z.enum(GYM_VALUES),

  walkability: z.enum(WALKABILITY_VALUES),
  checkInTime: z.string().trim().refine(validateTime, "Check-in time must be HH:mm"),
  checkOutTime: z.string().trim().refine(validateTime, "Check-out time must be HH:mm"),
  phone: z.string().trim().min(1, "Phone is required").max(50, "Phone must be less than 50 characters"),
  websiteUrl: z.string().trim().url("Website URL must be valid"),
  bookingUrl: z.string().trim().url("Booking URL must be valid").optional().or(z.literal("")).transform((value) => (value === "" ? undefined : value)),
  googleMapsUrl: z.string().trim().url("Google Maps URL must be valid").optional().or(z.literal("")).transform((value) => (value === "" ? undefined : value)),

  googleUrl: z.string().trim().url("Google URL must be a valid URL").optional().or(z.literal("")).transform((value) => (value === "" ? undefined : value)),
  placeId: z.string().trim().min(1, "Place ID is required"),
  latitude: z.string().trim().min(1, "Latitude is required").refine(validateLatitude, "Latitude must be a number between -90 and 90"),
  longitude: z.string().trim().min(1, "Longitude is required").refine(validateLongitude, "Longitude must be a number between -180 and 180"),
  locationKey: z.string().trim().optional().or(z.literal("")).refine(
    (value) =>
      value == null ||
      value === "" ||
      /^[a-z0-9-]+(\|[a-z0-9-]+){0,2}$/.test(value),
    "Location Key must be lowercase kebab-case (country|city|neighborhood)"
  ),
  district: z.string().trim().optional().or(z.literal("")),
  ianaTimeId: z.string().trim().optional().or(z.literal("")),
});

export const addAccommodationsSubmitSchema = z
  .object({
    prefillSignature: z.string().nullable(),
    formValues: addAccommodationsSchema,
  })
  .superRefine((data, ctx) => {
    if (data.prefillSignature === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["prefillSignature"],
        message: "Run Google lookup before creating the accommodations document.",
      });
      return;
    }

    const currentSignature = buildAccommodationsPrefillSignature(
      data.formValues.name,
      data.formValues.address
    );

    if (currentSignature !== data.prefillSignature) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["prefillSignature"],
        message: "Name or address changed after lookup. Run Google lookup again.",
      });
    }
  });

export type AddAccommodationsFormData = z.infer<typeof addAccommodationsSchema>;

