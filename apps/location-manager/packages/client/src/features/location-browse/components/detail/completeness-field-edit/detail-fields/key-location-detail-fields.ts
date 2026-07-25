import type { LocationResponse } from "@client/shared/services/api/types";
import type {
  DetailFieldConfig,
  DetailFieldOption,
} from "./detail-field.types";
import { isRecord } from "./detail-value.utils";

const STATUS_OPTIONS: DetailFieldOption[] = [
  { value: "active", label: "Active", description: "Currently operating." },
  {
    value: "inactive",
    label: "Inactive",
    description: "Not currently operating.",
  },
  {
    value: "seasonal",
    label: "Seasonal",
    description: "Operates seasonally.",
  },
];

function readString(location: LocationResponse, key: string): string {
  const details = location.keyLocationsDetails;
  if (!isRecord(details)) return "";
  const value = details[key];
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

export const KEY_LOCATION_DETAIL_FIELDS: Record<string, DetailFieldConfig> = {
  "keyLocations.type": {
    kind: "text",
    label: "Type",
    detailsKey: "keyLocationsDetails",
    path: ["location_type"],
    mirror: "type",
    read: (location) =>
      readString(location, "location_type") || location.type?.trim() || "",
  },
  "keyLocations.status": {
    kind: "single",
    label: "Status",
    options: STATUS_OPTIONS,
    detailsKey: "keyLocationsDetails",
    path: ["status"],
    read: (location) => readString(location, "status"),
  },
};
