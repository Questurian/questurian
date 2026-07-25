import { parseAttractionsDetails } from "@client/shared/lib/attractions-details";
import { BOOLEAN_OPTIONS } from "@questurian/lm-shared";
import type {
  DetailFieldConfig,
  DetailFieldOption,
} from "./detail-field.types";
import { boolToDraft } from "./detail-value.utils";

const PRICING_OPTIONS: DetailFieldOption[] = [
  { value: "free", label: "Free", description: "No admission cost." },
  { value: "$", label: "$", description: "Budget-friendly pricing." },
  { value: "$$", label: "$$", description: "Moderate pricing tier." },
  { value: "$$$", label: "$$$", description: "Premium pricing tier." },
  { value: "$$$$", label: "$$$$", description: "Luxury pricing tier." },
];

export const ATTRACTIONS_DETAIL_FIELDS: Record<string, DetailFieldConfig> = {
  "attractions.type": {
    kind: "text",
    label: "Type",
    detailsKey: "attractionsDetails",
    path: ["core", "attraction_type"],
    mirror: "type",
    read: (location) =>
      parseAttractionsDetails(location.attractionsDetails).attractionType ??
      location.type?.trim() ??
      "",
  },
  "attractions.pricing": {
    kind: "single",
    label: "Pricing",
    options: PRICING_OPTIONS,
    detailsKey: "attractionsDetails",
    path: ["core", "pricing"],
    mirror: "priceLevel",
    allowEmpty: true,
    read: (location) =>
      parseAttractionsDetails(location.attractionsDetails).pricing ??
      location.priceLevel?.trim() ??
      "",
  },
  "attractions.bookingRequired": {
    kind: "boolean",
    label: "Booking Required",
    options: BOOLEAN_OPTIONS,
    detailsKey: "attractionsDetails",
    path: ["visit", "booking_required"],
    read: (location) =>
      boolToDraft(
        parseAttractionsDetails(location.attractionsDetails).bookingRequired
      ),
  },
};
