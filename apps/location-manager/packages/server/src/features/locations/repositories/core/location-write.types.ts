import { getDb } from "@server/shared/db/client";
import type { Location } from "../../models/location";

export type DbClient = ReturnType<typeof getDb>;

export type TypedLocationParams = {
  type?: string | null;
  hoursJson?: string | null;
  idealForJson?: string | null;
  nightlifeDetailsJson?: string | null;
  accommodationsDetailsJson?: string | null;
  attractionsDetailsJson?: string | null;
  keyLocationsDetailsJson?: string | null;
  tripadvisorMealTypesJson?: string | null;
  tripadvisorCuisinesJson?: string | null;
  tripadvisorFeaturesJson?: string | null;
  menuUrl?: string | null;
  bookingUrl?: string | null;
  priceLevel?: string | null;
};

export type UpdatePlan = {
  setClause: string[];
  params: Record<string, unknown>;
};

export function toTypedLocationParams(location: Location): TypedLocationParams {
  return {
    type: location.type || null,
    hoursJson: location.hoursJson || null,
    idealForJson: location.idealForJson || null,
    nightlifeDetailsJson: location.nightlifeDetailsJson || null,
    accommodationsDetailsJson: location.accommodationsDetailsJson || null,
    attractionsDetailsJson: location.attractionsDetailsJson || null,
    keyLocationsDetailsJson: location.keyLocationsDetailsJson || null,
    tripadvisorMealTypesJson: location.tripadvisorMealTypesJson || null,
    tripadvisorCuisinesJson: location.tripadvisorCuisinesJson || null,
    tripadvisorFeaturesJson: location.tripadvisorFeaturesJson || null,
    menuUrl: location.menuUrl || null,
    bookingUrl: location.bookingUrl || null,
    priceLevel: location.priceLevel || null,
  };
}
