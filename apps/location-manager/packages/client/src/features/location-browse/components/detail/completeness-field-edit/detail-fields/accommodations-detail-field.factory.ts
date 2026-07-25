import type { LocationResponse } from "@client/shared/services/api/types";
import {
  parseAccommodationsDetails,
  type ParsedAccommodationsDetails,
} from "@client/shared/lib/accommodations-details";
import { BOOLEAN_OPTIONS } from "@questurian/lm-shared";
import type {
  DetailDraftValue,
  DetailFieldConfig,
  DetailFieldOption,
} from "./detail-field.types";
import { boolToDraft } from "./detail-value.utils";

export function accommodationsTextField(
  path: string[],
  label: string,
  read: (
    parsed: ParsedAccommodationsDetails,
    location: LocationResponse
  ) => DetailDraftValue,
  mirror?: DetailFieldConfig["mirror"],
  options?: DetailFieldOption[]
): DetailFieldConfig {
  return {
    kind: options ? "single" : "text",
    label,
    options,
    detailsKey: "accommodationsDetails",
    path,
    mirror,
    read: (location) =>
      read(
        parseAccommodationsDetails(location.accommodationsDetails),
        location
      ),
  };
}

export function accommodationsSingleField(
  path: string[],
  label: string,
  options: DetailFieldOption[],
  read: (parsed: ParsedAccommodationsDetails) => DetailDraftValue
): DetailFieldConfig {
  return {
    kind: "single",
    label,
    options,
    detailsKey: "accommodationsDetails",
    path,
    read: (location) =>
      read(parseAccommodationsDetails(location.accommodationsDetails)),
  };
}

export function accommodationsMultiField(
  path: string[],
  label: string,
  options: DetailFieldOption[],
  read: (parsed: ParsedAccommodationsDetails) => string[]
): DetailFieldConfig {
  return {
    kind: "multi",
    label,
    options,
    detailsKey: "accommodationsDetails",
    path,
    read: (location) =>
      read(parseAccommodationsDetails(location.accommodationsDetails)),
  };
}

export function accommodationsBooleanField(
  path: string[],
  label: string,
  read: (parsed: ParsedAccommodationsDetails) => boolean | null
): DetailFieldConfig {
  return {
    kind: "boolean",
    label,
    options: BOOLEAN_OPTIONS,
    detailsKey: "accommodationsDetails",
    path,
    read: (location) =>
      boolToDraft(
        read(parseAccommodationsDetails(location.accommodationsDetails))
      ),
  };
}
