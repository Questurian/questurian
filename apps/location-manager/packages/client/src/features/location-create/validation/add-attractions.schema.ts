import { z } from "zod";

const PRICE_LEVEL_VALUES = ["free", "$", "$$", "$$$", "$$$$"] as const;
const BOOKING_REQUIRED_VALUES = ["yes", "no"] as const;

type OperationHoursRow = { day: string; hours: string };

function validateLatitude(value: string) {
  const parsed = Number(value);
  return !Number.isNaN(parsed) && parsed >= -90 && parsed <= 90;
}

function validateLongitude(value: string) {
  const parsed = Number(value);
  return !Number.isNaN(parsed) && parsed >= -180 && parsed <= 180;
}

function parseOperationHoursJson(value: string): Record<string, unknown> | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

    const record = parsed as Record<string, unknown>;
    if (!Array.isArray(record.hours)) return null;

    const hasInvalidRow = record.hours.some((row) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) return true;
      const normalized = row as Partial<OperationHoursRow>;
      return !normalized.day?.trim() || !normalized.hours?.trim();
    });

    return hasInvalidRow ? null : record;
  } catch {
    return null;
  }
}

export function normalizeAttractionsAddress(address: string) {
  return address.trim();
}

export function buildAttractionsPrefillSignature(name: string, address: string) {
  return `${name.trim().toLowerCase()}|${normalizeAttractionsAddress(address).toLowerCase()}`;
}

export const addAttractionsSchema = z.object({
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
  type: z.string().trim().min(1, "Type is required"),
  priceLevel: z.enum(PRICE_LEVEL_VALUES),
  bookingRequired: z.enum(BOOKING_REQUIRED_VALUES),
  website: z
    .string()
    .trim()
    .url("Website URL must be valid")
    .optional()
    .or(z.literal(""))
    .transform((value) => (value === "" ? undefined : value)),
  phone: z.string().trim().optional().or(z.literal("")),
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
  placeId: z.string().trim().min(1, "Place ID is required"),
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
  hours: z
    .string()
    .trim()
    .min(1, "Operating hours are required")
    .refine(
      (value) => parseOperationHoursJson(value) !== null,
      "Set hours using the schedule editor"
    ),
});

export const addAttractionsSubmitSchema = z
  .object({
    prefillSignature: z.string().nullable(),
    formValues: addAttractionsSchema,
  })
  .superRefine((data, ctx) => {
    if (data.prefillSignature === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["prefillSignature"],
        message: "Run Google lookup before creating the attractions document.",
      });
      return;
    }

    const currentSignature = buildAttractionsPrefillSignature(
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

export function buildAttractionsOperationHours(formValues: Pick<
  z.infer<typeof addAttractionsSchema>,
  "hours"
>) {
  return parseOperationHoursJson(formValues.hours) ?? {};
}

export type AddAttractionsFormData = z.infer<typeof addAttractionsSchema>;
