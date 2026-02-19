import { z } from "zod";
import { IDEAL_FOR_TAGS } from "@questurian/lm-shared";

const idealForSchema = z
  .array(z.enum(IDEAL_FOR_TAGS))
  .min(1, "Select at least 1 Ideal For tag")
  .max(4, "Select up to 4 Ideal For tags")
  .refine((tags) => new Set(tags).size === tags.length, {
    message: "Ideal For tags must be unique",
  });

function validateLatitude(value: string) {
  const parsed = Number(value);
  return !Number.isNaN(parsed) && parsed >= -90 && parsed <= 90;
}

function validateLongitude(value: string) {
  const parsed = Number(value);
  return !Number.isNaN(parsed) && parsed >= -180 && parsed <= 180;
}

export function normalizeRestaurantAddress(address: string) {
  return address.trim();
}

export function buildRestaurantPrefillSignature(name: string, address: string) {
  return `${name.trim().toLowerCase()}|${normalizeRestaurantAddress(address).toLowerCase()}`;
}

export const addRestaurantSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Location name is required")
    .max(200, "Name must be less than 200 characters"),
  address: z
    .string()
    .trim()
    .min(1, "Address is required")
    .max(500, "Address must be less than 500 characters"),
  type: z.string().optional().or(z.literal("")).transform((value) => (value === "" ? undefined : value)),
  idealFor: idealForSchema,
  tripadvisorUrl: z
    .string()
    .trim()
    .url("TripAdvisor URL must be a valid URL")
    .optional()
    .or(z.literal(""))
    .transform((value) => (value === "" ? undefined : value)),
  googleUrl: z
    .string()
    .trim()
    .url("Google URL must be a valid URL")
    .optional()
    .or(z.literal(""))
    .transform((value) => (value === "" ? undefined : value)),
  placeId: z
    .string()
    .trim()
    .min(1, "Place ID is required"),
  latitude: z
    .string()
    .trim()
    .min(1, "Latitude is required")
    .refine(validateLatitude, "Latitude must be a number between -90 and 90"),
  longitude: z
    .string()
    .trim()
    .min(1, "Longitude is required")
    .refine(validateLongitude, "Longitude must be a number between -180 and 180"),
  locationKey: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine(
      (value) =>
        value == null ||
        value === "" ||
        /^[a-z0-9-]+(\|[a-z0-9-]+){0,2}$/.test(value),
      "Location Key must be lowercase kebab-case (country|city|neighborhood)"
    ),
  district: z.string().trim().optional().or(z.literal("")),
  ianaTimeId: z.string().trim().optional().or(z.literal("")),
});

export const addRestaurantSubmitSchema = z
  .object({
    prefillSignature: z.string().nullable(),
    formValues: addRestaurantSchema,
  })
  .superRefine((data, ctx) => {
    if (data.prefillSignature === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["prefillSignature"],
        message: "Run Google lookup before creating the restaurant document.",
      });
      return;
    }

    const currentSignature = buildRestaurantPrefillSignature(
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

export type AddRestaurantFormData = z.infer<typeof addRestaurantSchema>;
