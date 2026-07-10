import type { UpdateMapsRequest } from "@client/shared/services/api/types";
import { buildAccommodationsDetails } from "@client/shared/lib/accommodations-details";
import { normalizeAccommodationsAddress, type AddAccommodationsFormData } from "../../validation/add-accommodations.schema";
import { toBoolean } from "../hydration/accommodations-edit-hydration";

/** Builds the `UpdateMapsRequest` body for an accommodations edit submission. */
export function buildAccommodationsUpdatePayload(data: AddAccommodationsFormData): UpdateMapsRequest {
  const normalizedAddress = normalizeAccommodationsAddress(data.address);

  const accommodationsDetails = buildAccommodationsDetails({
    name: data.name,
    price: data.price,
    district: data.district || "",
    type: data.type,
    perfectFor: data.perfectFor,
    kidFriendly: toBoolean(data.kidFriendly),
    ac: toBoolean(data.ac),
    wifi: toBoolean(data.wifi),
    extraGuestFee: toBoolean(data.extraGuestFee),
    parking: data.parking,
    breakfastServed: toBoolean(data.breakfastServed),
    vibe: data.vibe,
    workspace: data.workspace,
    restaurant: toBoolean(data.restaurant),
    pool: data.pool,
    rooftopLounge: toBoolean(data.rooftopLounge),
    jacuzzi: data.jacuzzi,
    gym: data.gym,
    address: normalizedAddress,
    walkability: data.walkability,
    checkInTime: data.checkInTime,
    checkOutTime: data.checkOutTime,
    phone: data.phone || "",
    websiteUrl: data.websiteUrl,
    bookingUrl: data.bookingUrl || "",
    googleMapsUrl: data.googleMapsUrl || "",
  });

  return {
    name: data.name,
    title: data.title?.trim() || undefined,
    address: normalizedAddress,
    type: data.type,
    priceLevel: data.price,
    phoneNumber: data.phone || undefined,
    website: data.websiteUrl || undefined,
    district: data.district || undefined,
    locationKey: data.locationKey || undefined,
    ianaTimeId: data.ianaTimeId || undefined,
    placeId: data.placeId || undefined,
    accommodationsDetails,
  };
}
