import type { LocationResponse } from "@client/shared/services/api/types";
import { parseAccommodationsDetails } from "@client/shared/lib/accommodations-details";
import { parseNightlifeDetails } from "../../../utils/nightlife-details";
import { getAttractionsOptionalCompletenessFields } from "./attractions";
import { createCompletenessFieldContext } from "./common";
import type { CompletenessField } from "./types";

export function getImportantOptionalCompletenessFields(
  locationDetail: LocationResponse
): CompletenessField[] {
  const category = locationDetail.category;
  if (category === "attractions") {
    return getAttractionsOptionalCompletenessFields(
      createCompletenessFieldContext(locationDetail)
    );
  }
  if (
    category !== "dining" &&
    category !== "accommodations" &&
    category !== "nightlife"
  ) {
    return [];
  }

  const label =
    category === "accommodations"
      ? "Booking URL"
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
