import type { LocationResponse } from "../../../../models/location";
import type { PayloadRelationshipId } from "../../clients/payload-api.client";

const PRICE_LEVEL_TO_PAYLOAD: Record<string, string> = {
  "$": "1",
  "$$": "2",
  "$$$": "3",
  "$$$$": "4",
  free: "1",
  budget: "1",
  inexpensive: "1",
  "mid-range": "2",
  moderate: "2",
  expensive: "3",
  "very expensive": "4",
  luxury: "4",
};

const WEEKDAY_LABELS: Record<string, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function asString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const normalized = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
  return normalized.length > 0 ? normalized : undefined;
}

export function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "yes" || normalized === "1") return true;
    if (normalized === "false" || normalized === "no" || normalized === "0") return false;
  }
  return undefined;
}

export function unwrapLabeledValue(value: unknown): unknown {
  const record = asRecord(value);
  return record && Object.prototype.hasOwnProperty.call(record, "value")
    ? record.value
    : value;
}

export function toPayloadRelationshipId(id: string | number): PayloadRelationshipId {
  if (typeof id === "number") return id;
  const trimmed = id.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : trimmed;
}

export function normalizeOperationHoursForPayload(
  operationHours: Record<string, unknown> | null
): { hours: Array<{ day: string; hours: string }> } | undefined {
  if (!operationHours) return undefined;

  if (Array.isArray(operationHours.hours)) {
    const hours = operationHours.hours
      .map(normalizeHoursRow)
      .filter((row): row is { day: string; hours: string } => row !== null);
    return hours.length > 0 ? { hours } : undefined;
  }

  const hours = Object.entries(operationHours)
    .filter(([key]) => key !== "currently_open" && key !== "hours")
    .map(([key, value]) => {
      const day = WEEKDAY_LABELS[key.toLowerCase()] ?? key;
      const hoursValue = typeof value === "string" ? value.trim() : "";
      return hoursValue ? { day, hours: hoursValue } : null;
    })
    .filter((row): row is { day: string; hours: string } => row !== null);

  return hours.length > 0 ? { hours } : undefined;
}

function normalizeHoursRow(row: unknown): { day: string; hours: string } | null {
  const record = asRecord(row);
  if (!record) return null;
  const day = typeof record.day === "string" ? record.day.trim() : "";
  const hours = typeof record.hours === "string" ? record.hours.trim() : "";
  return day && hours ? { day, hours } : null;
}

export function mapCategoryCommonPayloadFields(location: LocationResponse) {
  const mappedPriceLevel = location.priceLevel
    ? PRICE_LEVEL_TO_PAYLOAD[location.priceLevel.toLowerCase()]
    : undefined;
  return {
    type: asString(location.type) ?? null,
    priceLevel: mappedPriceLevel ?? null,
    ianaTimeId: asString(location.ianaTimeId) ?? null,
  };
}
