import type { LocationCategory, LocationResponse } from "../../../models/location";
import type { PatchMapsDto } from "../../../validation/schemas/maps.schemas";
import { BadRequestError, NotFoundError } from "@shared/errors/http-error";
import { validateCategory } from "../../../utils/category-utils";
import { demoteProvenanceForOperatorEdit } from "../../../utils/location-utils/provenance";
import type { MapsServiceOperationContext } from "./maps.types";
import {
  generateGoogleMapsUrl,
  getLocationByIdForUpdate,
  getUploadsByLocationId,
  setAttractionTours,
  updateLocationById,
} from "../maps.dependencies";

const MAX_ATTRACTION_GALLERY_ITEMS = 20;

export async function updateMapsLocationByIdOperation(
  context: MapsServiceOperationContext,
  id: number,
  updates: PatchMapsDto,
  expectedCategory?: LocationCategory
): Promise<LocationResponse> {
  console.log(`📝 [UPDATE] Location ${id} received updates:`, updates);

  const currentLocation = getLocationByIdForUpdate(id);
  if (!currentLocation) {
    throw new NotFoundError("Location", id);
  }
  if (expectedCategory && currentLocation.category !== expectedCategory) {
    throw new NotFoundError("Location", id);
  }
  const category = validateCategory(currentLocation.category);
  const tourIds = context.normalizeTourIds(updates.tourIds);
  if (tourIds !== undefined && category !== "attractions") {
    throw new BadRequestError("Tours can only be linked to attractions");
  }

  const nextName = updates.name ?? currentLocation.name;
  const nextAddress = updates.address ?? currentLocation.address;
  const shouldUpdateUrl = updates.name !== undefined || updates.address !== undefined;
  const shouldAutoApproveTaxonomy = updates.autoApproveTaxonomy === true;

  if (updates.locationKey !== undefined && updates.locationKey) {
    updates.locationKey = context.taxonomyCorrectionService.applyCorrections(updates.locationKey);
    context.taxonomyService.ensureTaxonomyEntry(updates.locationKey, {
      autoApprove: shouldAutoApproveTaxonomy,
    });
  }

  if (context.shouldPersistIdealFor(category)) {
    context.validateIdealForTagsByCategory(category, updates.idealFor);
  }

  const hoursJson = context.normalizeOperationHours(updates.operationHours);
  const nightlifeDetailsJson = context.normalizeNightlifeDetails(updates.nightlifeDetails);
  const accommodationsDetailsJson = context.normalizeAccommodationsDetails(updates.accommodationsDetails);
  const attractionsDetailsJson = context.normalizeAttractionsDetails(updates.attractionsDetails);
  const keyLocationsDetailsJson = context.normalizeKeyLocationsDetails(updates.keyLocationsDetails);
  const idealForJson = context.shouldPersistIdealFor(category)
    ? context.normalizeIdealForTags(updates.idealFor)
    : undefined;
  const tripadvisorMealTypesJson = context.normalizeTripadvisorList(updates.tripadvisorMealTypes);
  const tripadvisorCuisinesJson = context.normalizeTripadvisorList(updates.tripadvisorCuisines);
  const tripadvisorFeaturesJson = context.normalizeTripadvisorList(updates.tripadvisorFeatures, {
    filterFeatures: true,
  });
  const selectedPayloadMediaSetIdsJson = context.normalizeSelectedPayloadMediaSetIds(
    updates.selectedPayloadMediaSetIds
  );

  if (category === "attractions" && selectedPayloadMediaSetIdsJson !== undefined) {
    const uploadsCount = getUploadsByLocationId(id).length;
    const selectedPayloadMediaSetCount = selectedPayloadMediaSetIdsJson
      ? (JSON.parse(selectedPayloadMediaSetIdsJson) as string[]).length
      : 0;

    if (uploadsCount + selectedPayloadMediaSetCount > MAX_ATTRACTION_GALLERY_ITEMS) {
      throw new BadRequestError(
        `Attractions gallery supports up to ${MAX_ATTRACTION_GALLERY_ITEMS} Payload media sets total. ` +
        `This location already has ${uploadsCount} upload${uploadsCount === 1 ? "" : "s"}.`
      );
    }
  }

  const updateData = {
    ...(updates.name !== undefined && { name: updates.name }),
    ...(updates.address !== undefined && { address: updates.address }),
    ...(updates.title !== undefined && { title: updates.title }),
    ...(updates.lat !== undefined && { lat: updates.lat }),
    ...(updates.lng !== undefined && { lng: updates.lng }),
    ...(updates.type !== undefined && { type: updates.type }),
    ...(updates.locationKey !== undefined && { locationKey: updates.locationKey }),
    ...(updates.district !== undefined && { district: updates.district }),
    ...(updates.contactAddress !== undefined && { contactAddress: updates.contactAddress }),
    ...(updates.countryCode !== undefined && { countryCode: updates.countryCode }),
    ...(updates.ianaTimeId !== undefined && { ianaTimeId: updates.ianaTimeId }),
    ...(updates.phoneNumber !== undefined && { phoneNumber: updates.phoneNumber }),
    ...(updates.website !== undefined && { website: updates.website }),
    ...(updates.menuUrl !== undefined && { menuUrl: updates.menuUrl }),
    ...(updates.bookingUrl !== undefined && { bookingUrl: updates.bookingUrl }),
    ...(updates.email !== undefined && { email: updates.email }),
    ...(updates.neighborhoodDescription !== undefined && { neighborhoodDescription: updates.neighborhoodDescription }),
    ...(selectedPayloadMediaSetIdsJson !== undefined && { selectedPayloadMediaSetIdsJson }),
    ...(idealForJson !== undefined && { idealForJson }),
    ...(nightlifeDetailsJson !== undefined && { nightlifeDetailsJson }),
    ...(accommodationsDetailsJson !== undefined && { accommodationsDetailsJson }),
    ...(attractionsDetailsJson !== undefined && { attractionsDetailsJson }),
    ...(keyLocationsDetailsJson !== undefined && { keyLocationsDetailsJson }),
    ...(hoursJson !== undefined && { hoursJson }),
    ...(tripadvisorMealTypesJson !== undefined && { tripadvisorMealTypesJson }),
    ...(tripadvisorCuisinesJson !== undefined && { tripadvisorCuisinesJson }),
    ...(tripadvisorFeaturesJson !== undefined && { tripadvisorFeaturesJson }),
    ...(updates.priceLevel !== undefined && { priceLevel: updates.priceLevel }),
    ...(updates.placeId !== undefined && { placeId: updates.placeId }),
    ...(shouldUpdateUrl && { url: generateGoogleMapsUrl(nextName, nextAddress) }),
    ...(updates.tripadvisorUrl !== undefined && context.resolveTripadvisorFields(updates.tripadvisorUrl)),
  };

  // ADR-0002 §2: operator edits flip field provenance to operator.
  const provenanceJson = demoteProvenanceForOperatorEdit(currentLocation, updateData);
  const persistedUpdate =
    provenanceJson !== undefined ? { ...updateData, provenanceJson } : updateData;

  if (Object.keys(persistedUpdate).length > 0) {
    const success = updateLocationById(id, persistedUpdate);

    if (!success) {
      throw new BadRequestError("Failed to update location");
    }
  }

  if (tourIds !== undefined) {
    setAttractionTours(id, tourIds);
  }

  const updatedLocation = getLocationByIdForUpdate(id);
  if (!updatedLocation) {
    throw new NotFoundError("Location", id);
  }

  console.log(`✅ [UPDATE] Location ${id} updated successfully. New type:`, updatedLocation.type);

  return context.buildLocationResponseById(id, updatedLocation);
}
