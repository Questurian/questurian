import {
  getAttractionCompletenessFields,
  type AttractionCompletenessFacts,
} from "@questurian/lm-shared";
import type { CompletenessField, CompletenessFieldContext } from "./types";

function getAttractionsCompletenessFacts({
  locationDetail,
  contact,
  source,
  attractionsDetails,
  hasOperationHours,
  hasMedia,
}: CompletenessFieldContext): AttractionCompletenessFacts {
  return {
    name: Boolean(source.name?.trim()),
    title: Boolean(locationDetail.title?.trim()),
    sourceAddress: Boolean(source.address?.trim()),
    category: Boolean(locationDetail.category),
    locationKey: Boolean(locationDetail.locationKey?.trim()),
    district: Boolean(locationDetail.district?.trim()),
    countryCode: Boolean(contact.countryCode?.trim()),
    ianaTimeId: Boolean(locationDetail.ianaTimeId?.trim()),
    coordinates:
      locationDetail.coordinates?.lat != null &&
      locationDetail.coordinates?.lng != null,
    "attractions.type": Boolean(
      locationDetail.type?.trim() || attractionsDetails.attractionType
    ),
    "attractions.bookingRequired": attractionsDetails.bookingRequired !== null,
    operationHours: Boolean(hasOperationHours || attractionsDetails.hasVisitHours),
    media: hasMedia,
    website: Boolean(contact.website?.trim() || attractionsDetails.website),
    phone: Boolean(
      contact.phoneNumber?.trim() ||
      contact.phoneUnavailable ||
      attractionsDetails.phone
    ),
    "attractions.pricing": Boolean(
      locationDetail.priceLevel?.trim() || attractionsDetails.pricing
    ),
    bookingUrl: Boolean(locationDetail.bookingUrl?.trim()),
  };
}

export function getAttractionsCompletenessFields(
  context: CompletenessFieldContext
): CompletenessField[] {
  return getAttractionCompletenessFields(
    getAttractionsCompletenessFacts(context),
    true
  );
}

export function getAttractionsOptionalCompletenessFields(
  context: CompletenessFieldContext
): CompletenessField[] {
  return getAttractionCompletenessFields(
    getAttractionsCompletenessFacts(context),
    false
  );
}
