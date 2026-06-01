import type { FieldErrors } from "react-hook-form";
import type { AddNightlifeFormData } from "../../validation/add-nightlife.schema";
import { NIGHTLIFE_SECTION_ORDER, type NightlifeFormSection } from "../nightlife-create.types";

const SECTION_FIELDS: Record<NightlifeFormSection, Array<keyof AddNightlifeFormData>> = {
  step1: ["name", "location"],
  entities: ["googleUrl", "placeId", "latitude", "longitude"],
  core: ["clubType", "music", "idealFor"],
  space: ["priceTier", "venueType", "venueSize", "spaceLayout", "vibe", "peakHours"],
  scene: ["musicFormat", "touristPresence", "energyLevel", "vipAndBottleService", "crowdProfile", "dressCode"],
  contact: ["countryCode", "phone", "website", "bookingUrl", "tripadvisorUrl", "daytimeRestaurant"],
};

export function getNightlifeSectionFields(section: NightlifeFormSection) {
  return SECTION_FIELDS[section];
}

export function findFirstNightlifeErrorSection(errors: FieldErrors<AddNightlifeFormData>) {
  return NIGHTLIFE_SECTION_ORDER.find((section) =>
    SECTION_FIELDS[section].some((fieldName) => Boolean(errors[fieldName]))
  ) ?? null;
}

export function getNightlifeFormProgress(
  values: AddNightlifeFormData,
  errors: FieldErrors<AddNightlifeFormData>,
  isPrefillReady: boolean
) {
  const hasValue = (value: string | undefined) => Boolean(value && value.trim().length > 0);

  return {
    flowSections: [
      { key: "step1", label: "Step 1", complete: isPrefillReady },
      { key: "entities", label: "Entities", complete: isPrefillReady },
      {
        key: "core",
        label: "Core",
        complete: Boolean(values.clubType) && values.music.length > 0 && values.idealFor.length > 0,
      },
      {
        key: "space",
        label: "Space",
        complete:
          Boolean(values.priceTier) &&
          Boolean(values.venueType) &&
          Boolean(values.venueSize) &&
          values.spaceLayout.length > 0 &&
          values.vibe.length > 0 &&
          Boolean(values.peakHours),
      },
      {
        key: "scene",
        label: "Scene",
        complete:
          values.musicFormat.length > 0 &&
          Boolean(values.touristPresence) &&
          Boolean(values.energyLevel) &&
          Boolean(values.vipAndBottleService) &&
          Boolean(values.crowdProfile) &&
          values.dressCode.length > 0,
      },
      {
        key: "contact",
        label: "Contact",
        complete:
          Boolean(values.countryCode) &&
          hasValue(values.phone) &&
          hasValue(values.website) &&
          !errors.phone &&
          !errors.website &&
          !errors.tripadvisorUrl,
      },
    ] satisfies Array<{ key: NightlifeFormSection; label: string; complete: boolean }>,
  };
}
