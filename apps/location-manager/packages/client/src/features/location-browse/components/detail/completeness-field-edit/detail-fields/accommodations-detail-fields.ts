import {
  CHECK_IN_TIME_OPTIONS,
  CHECK_OUT_TIME_OPTIONS,
  GYM_OPTIONS,
  JACUZZI_OPTIONS,
  PARKING_OPTIONS,
  PERFECT_FOR_OPTIONS,
  POOL_OPTIONS,
  PRICE_OPTIONS,
  VIBE_OPTIONS,
  WALKABILITY_OPTIONS,
  WORKSPACE_OPTIONS,
} from "@questurian/lm-shared";
import type { DetailFieldConfig } from "./detail-field.types";
import {
  accommodationsBooleanField as booleanField,
  accommodationsMultiField as multiField,
  accommodationsSingleField as singleField,
  accommodationsTextField as textField,
} from "./accommodations-detail-field.factory";

export const ACCOMMODATIONS_DETAIL_FIELDS: Record<
  string,
  DetailFieldConfig
> = {
  "accommodations.type": textField(
    ["core", "type"],
    "Type",
    (parsed, location) => parsed.coreType ?? location.type?.trim() ?? "",
    "type"
  ),
  "accommodations.price": textField(
    ["core", "price"],
    "Price",
    (parsed, location) =>
      parsed.corePrice ?? location.priceLevel?.trim() ?? "",
    "priceLevel",
    PRICE_OPTIONS
  ),
  "accommodations.perfectFor": multiField(
    ["the_stay", "perfect_for"],
    "Perfect For",
    PERFECT_FOR_OPTIONS,
    (parsed) => parsed.perfectFor
  ),
  "accommodations.kidFriendly": booleanField(
    ["the_stay", "kid_friendly"],
    "Kid Friendly",
    (parsed) => parsed.kidFriendly
  ),
  "accommodations.ac": booleanField(
    ["the_stay", "ac"],
    "AC",
    (parsed) => parsed.ac
  ),
  "accommodations.wifi": booleanField(
    ["the_stay", "wifi"],
    "WiFi",
    (parsed) => parsed.wifi
  ),
  "accommodations.extraGuestFee": booleanField(
    ["the_stay", "extra_guest_fee"],
    "Extra Guest Fee",
    (parsed) => parsed.extraGuestFee
  ),
  "accommodations.parking": multiField(
    ["the_stay", "parking"],
    "Parking",
    PARKING_OPTIONS,
    (parsed) => parsed.parking
  ),
  "accommodations.breakfastServed": booleanField(
    ["the_stay", "breakfast_served"],
    "Breakfast Served",
    (parsed) => parsed.breakfastServed
  ),
  "accommodations.vibe": multiField(
    ["the_experience", "vibe"],
    "Vibe",
    VIBE_OPTIONS,
    (parsed) => parsed.vibe
  ),
  "accommodations.workspace": multiField(
    ["the_experience", "workspace"],
    "Workspace",
    WORKSPACE_OPTIONS,
    (parsed) => parsed.workspace
  ),
  "accommodations.restaurant": booleanField(
    ["the_experience", "restaurant"],
    "Restaurant",
    (parsed) => parsed.restaurant
  ),
  "accommodations.pool": multiField(
    ["the_experience", "pool"],
    "Pool",
    POOL_OPTIONS,
    (parsed) => parsed.pool
  ),
  "accommodations.rooftopLounge": booleanField(
    ["the_experience", "rooftop_lounge"],
    "Rooftop Lounge",
    (parsed) => parsed.rooftopLounge
  ),
  "accommodations.jacuzzi": multiField(
    ["the_experience", "jacuzzi"],
    "Jacuzzi",
    JACUZZI_OPTIONS,
    (parsed) => parsed.jacuzzi
  ),
  "accommodations.gym": singleField(
    ["the_experience", "gym"],
    "Gym",
    GYM_OPTIONS,
    (parsed) => parsed.gym ?? ""
  ),
  "accommodations.walkability": singleField(
    ["the_details", "walkability"],
    "Walkability",
    WALKABILITY_OPTIONS,
    (parsed) => parsed.walkability ?? ""
  ),
  "accommodations.checkInTime": singleField(
    ["the_details", "check_in_time"],
    "Check-In",
    CHECK_IN_TIME_OPTIONS,
    (parsed) => parsed.checkInTime ?? ""
  ),
  "accommodations.checkOutTime": singleField(
    ["the_details", "check_out_time"],
    "Check-Out",
    CHECK_OUT_TIME_OPTIONS,
    (parsed) => parsed.checkOutTime ?? ""
  ),
};
