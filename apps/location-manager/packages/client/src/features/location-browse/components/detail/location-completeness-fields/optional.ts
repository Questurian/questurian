import type { LocationResponse } from "@client/shared/services/api/types";
import { parseAccommodationsDetails } from "@client/shared/lib/accommodations-details";
import { parseNightlifeDetails } from "../../../utils/nightlife-details";
import type { CompletenessField } from "./types";

export function getImportantOptionalCompletenessFields(
  locationDetail: LocationResponse
): CompletenessField[] {
  const category = locationDetail.category;
  if (
    category !== "dining" &&
    category !== "accommodations" &&
    category !== "attractions" &&
    category !== "nightlife"
  ) {
    return [];
  }

  const label =
    category === "accommodations"
      ? "Booking URL"
      : category === "attractions"
        ? "Tickets URL"
        : "Reservation URL";
  const detailsUrl =
    category === "accommodations"
      ? parseAccommodationsDetails(locationDetail.accommodationsDetails).bookingUrl
      : category === "nightlife"
        ? parseNightlifeDetails(locationDetail.nightlifeDetails).bookingUrl
        : null;

  return [
    {
      key: "bookingUrl",
      label,
      present: Boolean(locationDetail.bookingUrl?.trim() || detailsUrl),
    },
  ];
}
