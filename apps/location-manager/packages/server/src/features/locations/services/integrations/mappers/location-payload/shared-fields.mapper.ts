import { BadRequestError } from "@shared/errors/http-error";
import type { LocationResponse } from "../../../../models/location";
import type { PayloadEntryData } from "../../clients/payload-api.client";
import type { UploadedImagesResult } from "../../types";
import { extractPhoneNumber, convertIsoToPhoneCountryCode } from "../../utils";
import { asString, toPayloadRelationshipId } from "./value-normalizers";

const LEGACY_LM_ONLY_FIELDS = [
  "neighborhoodDescription",
  "tripadvisorUrl",
  "tripadvisorLocationId",
  "placeId",
  "contactAddress",
  "sourceAddress",
  "locationKey",
  "district",
] as const;

const MAX_ATTRACTION_GALLERY_ITEMS = 20;

function getGalleryImageIds(
  location: LocationResponse,
  uploadedImages: UploadedImagesResult
): string[] {
  if (location.category !== "attractions") return uploadedImages.galleryImageIds;

  const galleryIds = Array.from(
    new Set([
      ...uploadedImages.galleryImageIds,
      ...(location.selectedPayloadMediaSetIds ?? []),
    ])
  );

  if (galleryIds.length > MAX_ATTRACTION_GALLERY_ITEMS) {
    throw new BadRequestError(
      `Attractions gallery exceeds Payload max of ${MAX_ATTRACTION_GALLERY_ITEMS} items`
    );
  }
  return galleryIds;
}

export function mapSharedPayloadFields(
  location: LocationResponse,
  uploadedImages: UploadedImagesResult,
  locationRef: string
): Pick<
  PayloadEntryData,
  | "title"
  | "locationRef"
  | "gallery"
  | "instagramGallery"
  | "address"
  | "countryCode"
  | "phoneNumber"
  | "website"
  | "latitude"
  | "longitude"
  | "status"
  | "email"
  | "countryCodeIso"
  | "sourceName"
> {
  const payloadCountryCode = convertIsoToPhoneCountryCode(
    location.contact.countryCode || undefined
  );
  const phoneNumber = extractPhoneNumber(location.contact.phoneNumber || undefined);

  return {
    title: location.title || location.source.name,
    locationRef,
    gallery: getGalleryImageIds(location, uploadedImages).map((id) => ({
      image: toPayloadRelationshipId(id),
      altText: "",
      caption: "",
    })),
    instagramGallery: uploadedImages.instagramPostIds.map((id) => ({
      post: toPayloadRelationshipId(id),
    })),
    address: location.contact.url || "",
    countryCode: payloadCountryCode ?? null,
    phoneNumber: phoneNumber ?? null,
    website: asString(location.contact.website) ?? null,
    latitude: location.coordinates.lat ?? null,
    longitude: location.coordinates.lng ?? null,
    status: "published",
    email: asString(location.contact.email) ?? null,
    countryCodeIso: asString(location.contact.countryCode) ?? null,
    sourceName: asString(location.source.name) ?? null,
  };
}

export function stripLegacyLmFields(payload: PayloadEntryData): PayloadEntryData {
  const mutable = payload as PayloadEntryData & Record<string, unknown>;
  for (const field of LEGACY_LM_ONLY_FIELDS) delete mutable[field];
  return mutable;
}
