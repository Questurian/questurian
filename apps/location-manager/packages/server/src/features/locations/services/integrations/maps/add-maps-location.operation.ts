import type { CreateMapsRequest, LocationCategory, LocationResponse } from "../../../models/location";
import {
  sanitizeLocationProvenance,
  serializeLocationProvenanceJson,
} from "@questurian/lm-shared";
import { BadRequestError } from "@shared/errors/http-error";
import { validateCategory } from "../../../utils/category-utils";
import type { MapsServiceOperationContext } from "./maps.types";
import {
  createFromMaps,
  saveLocationOrThrow,
  setAttractionTours,
} from "../maps.dependencies";

export async function addMapsLocationOperation(
  context: MapsServiceOperationContext,
  payload: CreateMapsRequest,
  expectedCategory?: LocationCategory
): Promise<LocationResponse> {
  if (!payload.name || !payload.address) {
    throw new BadRequestError("Name and address required");
  }

  if (expectedCategory && payload.category !== expectedCategory) {
    throw new BadRequestError(`Category must be "${expectedCategory}" for this endpoint`);
  }

  const category = validateCategory(payload.category);
  const tourIds = context.normalizeTourIds(payload.tourIds);
  if (tourIds !== undefined && category !== "attractions") {
    throw new BadRequestError("Tours can only be linked to attractions");
  }

  const shouldAutoEnrichFromApis = category !== "nightlife";
  const apiKey = shouldAutoEnrichFromApis && context.config.hasGoogleMapsKey()
    ? context.config.GOOGLE_MAPS_API_KEY
    : undefined;
  const entry = await createFromMaps(payload.name, payload.address, apiKey, category, payload.type);
  entry.category = category;
  if (category === "nightlife") {
    entry.url = "";
  }
  if (payload.title !== undefined) entry.title = payload.title;
  if (payload.url !== undefined) entry.url = payload.url;
  if (payload.lat !== undefined) entry.lat = payload.lat;
  if (payload.lng !== undefined) entry.lng = payload.lng;
  if (payload.locationKey !== undefined) entry.locationKey = payload.locationKey;
  if (payload.district !== undefined) entry.district = payload.district;
  if (payload.contactAddress !== undefined) entry.contactAddress = payload.contactAddress;
  if (payload.countryCode) entry.countryCode = payload.countryCode;
  if (payload.ianaTimeId !== undefined) entry.ianaTimeId = payload.ianaTimeId;
  if (payload.placeId !== undefined) entry.placeId = payload.placeId;
  if (payload.phoneNumber !== undefined) entry.phoneNumber = payload.phoneNumber;
  if (payload.phoneUnavailable !== undefined) entry.phoneUnavailable = payload.phoneUnavailable;
  if (payload.website !== undefined) entry.website = payload.website;
  if (payload.menuUrl !== undefined) entry.menuUrl = payload.menuUrl;
  if (payload.bookingUrl !== undefined) entry.bookingUrl = payload.bookingUrl;
  Object.assign(entry, context.resolveTripadvisorFields(payload.tripadvisorUrl));
  if (payload.email) entry.email = payload.email;
  if (payload.neighborhoodDescription) entry.neighborhoodDescription = payload.neighborhoodDescription;
  const provenanceJson = serializeLocationProvenanceJson(
    sanitizeLocationProvenance(payload.provenance)
  );
  if (provenanceJson) {
    entry.provenanceJson = provenanceJson;
  }
  if (context.shouldPersistIdealFor(category)) {
    context.validateIdealForTagsByCategory(category, payload.idealFor);
  }

  const hoursJson = context.normalizeOperationHours(payload.operationHours);
  const nightlifeDetailsJson = context.normalizeNightlifeDetails(payload.nightlifeDetails);
  const accommodationsDetailsJson = context.normalizeAccommodationsDetails(payload.accommodationsDetails);
  const attractionsDetailsJson = context.normalizeAttractionsDetails(payload.attractionsDetails);
  const keyLocationsDetailsJson = context.normalizeKeyLocationsDetails(payload.keyLocationsDetails);
  const idealForJson = context.shouldPersistIdealFor(category)
    ? context.normalizeIdealForTags(payload.idealFor)
    : undefined;
  const tripadvisorMealTypesJson = context.normalizeTripadvisorList(payload.tripadvisorMealTypes);
  const tripadvisorCuisinesJson = context.normalizeTripadvisorList(payload.tripadvisorCuisines);
  const tripadvisorFeaturesJson = context.normalizeTripadvisorList(payload.tripadvisorFeatures, {
    filterFeatures: true,
  });

  if (hoursJson !== undefined) entry.hoursJson = hoursJson;
  if (nightlifeDetailsJson !== undefined) entry.nightlifeDetailsJson = nightlifeDetailsJson;
  if (accommodationsDetailsJson !== undefined) entry.accommodationsDetailsJson = accommodationsDetailsJson;
  if (attractionsDetailsJson !== undefined) entry.attractionsDetailsJson = attractionsDetailsJson;
  if (keyLocationsDetailsJson !== undefined) entry.keyLocationsDetailsJson = keyLocationsDetailsJson;
  if (payload.priceLevel !== undefined) entry.priceLevel = payload.priceLevel;
  if (idealForJson !== undefined) entry.idealForJson = idealForJson;
  if (tripadvisorMealTypesJson !== undefined) entry.tripadvisorMealTypesJson = tripadvisorMealTypesJson;
  if (tripadvisorCuisinesJson !== undefined) entry.tripadvisorCuisinesJson = tripadvisorCuisinesJson;
  if (tripadvisorFeaturesJson !== undefined) entry.tripadvisorFeaturesJson = tripadvisorFeaturesJson;

  if (entry.locationKey) {
    entry.locationKey = context.taxonomyCorrectionService.applyCorrections(entry.locationKey);
    context.taxonomyService.ensureTaxonomyEntry(entry.locationKey);
  }

  const duplicate = context.findDuplicateCandidate(entry);
  if (duplicate) {
    const mergedId = await context.mergeDuplicateLocation(duplicate, entry, {
      allowNoFieldUpdates: tourIds !== undefined,
    });
    if (tourIds !== undefined) setAttractionTours(mergedId, tourIds);
    return context.buildLocationResponseById(mergedId, duplicate);
  }

  const savedId = saveLocationOrThrow(entry);
  if (tourIds !== undefined) setAttractionTours(savedId, tourIds);

  if (entry.tripadvisorLocationId) {
    try {
      await context.tripAdvisorPlaceService.fetchAndMergePlaceData(savedId, entry.tripadvisorLocationId);
    } catch (error) {
      console.error(`[MapsService] TripAdvisor auto-fetch failed for location ${savedId}:`, error);
    }
  }

  return context.buildLocationResponseById(savedId, {
    ...entry,
    id: savedId,
  });
}
