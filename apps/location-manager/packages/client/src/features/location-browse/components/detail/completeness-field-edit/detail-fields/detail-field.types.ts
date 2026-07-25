import type { LocationResponse } from "@client/shared/services/api/types";

export type DetailFieldKind = "single" | "multi" | "boolean" | "text";

export interface DetailFieldOption {
  value: string;
  label: string;
  description: string;
}

export type DetailDraftValue = string | string[];
export type DetailsKey =
  | "accommodationsDetails"
  | "attractionsDetails"
  | "keyLocationsDetails";

export interface DetailFieldConfig {
  kind: DetailFieldKind;
  label: string;
  options?: DetailFieldOption[];
  detailsKey: DetailsKey;
  path: string[];
  mirror?: "type" | "priceLevel";
  allowEmpty?: boolean;
  read: (location: LocationResponse) => DetailDraftValue;
}
