import type { AddAccommodationsFormData } from "../../validation/add-accommodations.schema";
import type { AccommodationsFormSection } from "../accommodations-create.types";

function hasValue(value: string | undefined) {
  return Boolean(value && value.trim().length > 0);
}

export function getAccommodationsFormProgress(
  values: AddAccommodationsFormData,
  isPrefillReady: boolean,
  photoReady: boolean,
  selectedCount: number,
  isFormValid: boolean,
  bookingUrlAckPending: boolean
) {
  const stepOneComplete = isPrefillReady;
  const entitiesComplete = isPrefillReady;
  const coreComplete = Boolean(values.price) && (values.type?.length ?? 0) > 0;
  const stayComplete =
    (values.perfectFor?.length ?? 0) > 0 &&
    hasValue(values.kidFriendly) &&
    hasValue(values.ac) &&
    hasValue(values.wifi) &&
    hasValue(values.extraGuestFee) &&
    (values.parking?.length ?? 0) > 0 &&
    hasValue(values.breakfastServed);
  const experienceComplete =
    (values.vibe?.length ?? 0) > 0 &&
    (values.workspace?.length ?? 0) > 0 &&
    hasValue(values.restaurant) &&
    (values.pool?.length ?? 0) > 0 &&
    hasValue(values.rooftopLounge) &&
    (values.jacuzzi?.length ?? 0) > 0 &&
    hasValue(values.gym);
  const detailsComplete =
    hasValue(values.walkability) &&
    hasValue(values.phone) &&
    hasValue(values.websiteUrl) &&
    hasValue(values.checkInTime) &&
    hasValue(values.checkOutTime);
  const missingRequiredFields = [
    !isPrefillReady ? "Google lookup" : null,
    !hasValue(values.type) ? "Type" : null,
    !hasValue(values.price) ? "Price" : null,
    (values.perfectFor?.length ?? 0) === 0 ? "Perfect For" : null,
    !hasValue(values.kidFriendly) ? "Kid Friendly" : null,
    !hasValue(values.ac) ? "AC" : null,
    !hasValue(values.wifi) ? "WiFi" : null,
    !hasValue(values.extraGuestFee) ? "Extra Adult Guest Fee" : null,
    (values.parking?.length ?? 0) === 0 ? "Parking" : null,
    !hasValue(values.breakfastServed) ? "Breakfast Served" : null,
    (values.vibe?.length ?? 0) === 0 ? "Vibe" : null,
    (values.workspace?.length ?? 0) === 0 ? "Workspace" : null,
    !hasValue(values.restaurant) ? "Restaurant" : null,
    (values.pool?.length ?? 0) === 0 ? "Pool" : null,
    !hasValue(values.rooftopLounge) ? "Rooftop Lounge" : null,
    (values.jacuzzi?.length ?? 0) === 0 ? "Jacuzzi" : null,
    !hasValue(values.gym) ? "Gym" : null,
    !hasValue(values.walkability) ? "Walkability" : null,
    !hasValue(values.checkInTime) ? "Check-In Time" : null,
    !hasValue(values.checkOutTime) ? "Check-Out Time" : null,
    !hasValue(values.phone) ? "Phone" : null,
    !hasValue(values.websiteUrl) ? "Website URL" : null,
    !hasValue(values.placeId) ? "Place ID" : null,
    !hasValue(values.latitude) ? "Latitude" : null,
    !hasValue(values.longitude) ? "Longitude" : null,
  ].filter((field): field is string => Boolean(field));
  const createDisabledReason =
    missingRequiredFields.length > 0
      ? `Missing: ${missingRequiredFields.slice(0, 6).join(", ")}${missingRequiredFields.length > 6 ? "..." : ""}`
      : !isFormValid
        ? "Fix invalid field values before creating."
        : bookingUrlAckPending
          ? "Verify the AI-suggested Booking URL or clear it before creating."
          : null;
  const flowSections: Array<{ key: AccommodationsFormSection; label: string; complete: boolean }> = [
    { key: "step1", label: "Step 1", complete: stepOneComplete },
    { key: "entities", label: "Entities", complete: entitiesComplete },
    { key: "core", label: "Core", complete: coreComplete },
    { key: "stay", label: "Stay", complete: stayComplete },
    { key: "experience", label: "Experience", complete: experienceComplete },
    { key: "details", label: "Details", complete: detailsComplete },
    { key: "photos", label: "Photos", complete: photoReady || selectedCount === 0 },
  ];

  return {
    coreComplete,
    createDisabledReason,
    detailsComplete,
    entitiesComplete,
    experienceComplete,
    flowSections,
    stayComplete,
    stepOneComplete,
  };
}
