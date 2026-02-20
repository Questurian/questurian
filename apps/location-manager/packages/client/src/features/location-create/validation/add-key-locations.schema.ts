import { z } from "zod";

const KEY_LOCATION_STATUS_VALUES = [
  "active",
  "inactive",
  "temporarily_closed",
  "seasonal",
] as const;

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

function parseRecordJson(value: string): Record<string, unknown> | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseDelimitedList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

export function normalizeKeyLocationsAddress(address: string) {
  return address.trim();
}

export function buildKeyLocationsPrefillSignature(name: string, address: string) {
  return `${name.trim().toLowerCase()}|${normalizeKeyLocationsAddress(address).toLowerCase()}`;
}

export function parseKeyLocationsImageUrls(value: string): string[] {
  return parseDelimitedList(value).filter((item) => isValidUrl(item));
}

export function parseKeyLocationsRecordJson(value: string): Record<string, unknown> | null {
  return parseRecordJson(value);
}

export const addKeyLocationsSchema = z.object({
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
  status: z.enum(KEY_LOCATION_STATUS_VALUES, {
    errorMap: () => ({ message: "Status is required" }),
  }),
  accessDetails: z
    .string()
    .trim()
    .min(1, "Access details are required")
    .refine((value) => parseRecordJson(value) !== null, "Access details must be a valid JSON object"),
  infoDetails: z
    .string()
    .trim()
    .min(1, "Info details are required")
    .refine((value) => parseRecordJson(value) !== null, "Info details must be a valid JSON object"),
  images: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine((value) => {
      if (!value) return true;
      const raw = parseDelimitedList(value);
      if (raw.length === 0) return true;
      return raw.every((url) => isValidUrl(url));
    }, "Image URLs must be valid (comma or line separated)"),
  website: z.string().trim().url("Website URL must be valid"),
  phone: z
    .string()
    .trim()
    .min(1, "Phone is required")
    .max(50, "Phone must be less than 50 characters"),
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
  district: z.string().trim().min(1, "District is required"),
  ianaTimeId: z.string().trim().min(1, "Time zone is required"),
  hours: z
    .string()
    .trim()
    .min(1, "Operating hours are required")
    .refine(
      (value) => parseOperationHoursJson(value) !== null,
      "Set hours using the schedule editor"
    ),
});

export const addKeyLocationsSubmitSchema = z
  .object({
    prefillSignature: z.string().nullable(),
    formValues: addKeyLocationsSchema,
  })
  .superRefine((data, ctx) => {
    if (data.prefillSignature === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["prefillSignature"],
        message: "Run Google lookup before creating the key location document.",
      });
      return;
    }

    const currentSignature = buildKeyLocationsPrefillSignature(
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

export function buildKeyLocationsOperationHours(formValues: Pick<
  z.infer<typeof addKeyLocationsSchema>,
  "hours"
>) {
  return parseOperationHoursJson(formValues.hours) ?? {};
}

export type AddKeyLocationsFormData = z.infer<typeof addKeyLocationsSchema>;
