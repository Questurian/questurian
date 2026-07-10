import { buildAccommodationsDetails } from "@client/shared/lib/accommodations-details";
import {
  normalizeAccommodationsAddress,
  type AddAccommodationsFormData,
} from "../../validation/add-accommodations.schema";

function toBoolean(value: "yes" | "no") {
  return value === "yes";
}

export function buildAccommodationsCreatePayload(data: AddAccommodationsFormData) {
  const address = normalizeAccommodationsAddress(data.address);
  const latValue = data.latitude?.trim() ? Number(data.latitude) : undefined;
  const lngValue = data.longitude?.trim() ? Number(data.longitude) : undefined;
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
    address,
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
    title: data.title?.trim() || data.name,
    address,
    category: "accommodations" as const,
    type: data.type,
    priceLevel: data.price,
    phoneNumber: data.phone || undefined,
    website: data.websiteUrl || undefined,
    district: data.district || undefined,
    locationKey: data.locationKey || undefined,
    ianaTimeId: data.ianaTimeId || undefined,
    placeId: data.placeId || undefined,
    url: data.googleUrl || data.googleMapsUrl || undefined,
    lat: Number.isFinite(latValue) ? latValue : undefined,
    lng: Number.isFinite(lngValue) ? lngValue : undefined,
    accommodationsDetails,
  };
}
