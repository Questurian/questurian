import type { NightlifeFieldKey } from "./config";
import type { ParsedNightlifeDetails } from "./types";
import { asRecord, asString, asStringArray, getNestedValue, getSectionValue } from "./values";

export function parseNightlifeDetails(details: unknown): ParsedNightlifeDetails {
  const root = asRecord(details);
  const touristPresenceValue =
    getSectionValue(root, "theScene", "touristPresence") ??
    getSectionValue(root, "theSpace", "touristPresence");

  return {
    hasDetails: Boolean(root && Object.keys(root).length > 0),
    name: asString(getNestedValue(root, ["name"])),
    priceTier: asString(getNestedValue(root, ["price_tier"])),
    clubType: asString(getNestedValue(root, ["club_type"])),
    music: asStringArray(getNestedValue(root, ["music"])),
    venueType: asString(getSectionValue(root, "theSpace", "venueType")),
    venueSize: asString(getSectionValue(root, "theSpace", "venueSize")),
    spaceLayout: asStringArray(getSectionValue(root, "theSpace", "spaceLayout")),
    vibe: asStringArray(getSectionValue(root, "theSpace", "vibe")),
    peakHours: asString(getSectionValue(root, "theSpace", "peakHours")),
    touristPresence: asString(touristPresenceValue),
    musicFormat: asStringArray(getSectionValue(root, "theScene", "musicFormat")),
    dressCode: asStringArray(getSectionValue(root, "theScene", "dressCode")),
    energyLevel: asString(getSectionValue(root, "theScene", "energyLevel")),
    vipAndBottleService: asString(getSectionValue(root, "theScene", "vipAndBottleService")),
    crowdProfile: asString(getSectionValue(root, "theScene", "crowdProfile")),
    location: asString(getNestedValue(root, ["location"])),
    phone: asString(getNestedValue(root, ["phone"])),
    hours: asString(getNestedValue(root, ["hours"])),
    website: asString(getNestedValue(root, ["website"])),
    bookingUrl:
      asString(getNestedValue(root, ["booking_url"])) ??
      asString(getNestedValue(root, ["reserve_url"])),
    daytimeRestaurant: asString(getNestedValue(root, ["daytime_restaurant"])),
  };
}

export function getNightlifeFieldDraftValue(
  details: unknown,
  fieldKey: NightlifeFieldKey
): string | string[] {
  const parsed = parseNightlifeDetails(details);

  switch (fieldKey) {
    case "nightlife.clubType":
      return parsed.clubType ?? "";
    case "nightlife.priceTier":
      return parsed.priceTier ?? "";
    case "nightlife.music":
      return parsed.music;
    case "nightlife.venueType":
      return parsed.venueType ?? "";
    case "nightlife.venueSize":
      return parsed.venueSize ?? "";
    case "nightlife.spaceLayout":
      return parsed.spaceLayout;
    case "nightlife.vibe":
      return parsed.vibe;
    case "nightlife.peakHours":
      return parsed.peakHours ?? "";
    case "nightlife.musicFormat":
      return parsed.musicFormat;
    case "nightlife.touristPresence":
      return parsed.touristPresence ?? "";
    case "nightlife.dressCode":
      return parsed.dressCode;
    case "nightlife.energyLevel":
      return parsed.energyLevel ?? "";
    case "nightlife.vipAndBottleService":
      return parsed.vipAndBottleService ?? "";
    case "nightlife.crowdProfile":
      return parsed.crowdProfile ?? "";
    case "nightlife.daytimeRestaurant":
      return parsed.daytimeRestaurant ?? "";
  }
}
