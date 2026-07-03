export const NIGHTLIFE_FIELD_CONFIG = {
  "nightlife.clubType": { kind: "single", storage: "club_type" },
  "nightlife.priceTier": { kind: "single", storage: "price_tier" },
  "nightlife.music": { kind: "multi", storage: "music" },
  "nightlife.daytimeRestaurant": { kind: "single", storage: "daytime_restaurant" },
  "nightlife.venueType": {
    kind: "single",
    storage: "venueType",
    section: "theSpace",
    label: "Venue Type",
  },
  "nightlife.venueSize": {
    kind: "single",
    storage: "venueSize",
    section: "theSpace",
    label: "Venue Size",
  },
  "nightlife.spaceLayout": {
    kind: "multi",
    storage: "spaceLayout",
    section: "theSpace",
    label: "Layout",
  },
  "nightlife.vibe": {
    kind: "multi",
    storage: "vibe",
    section: "theSpace",
    label: "Vibe",
  },
  "nightlife.peakHours": {
    kind: "single",
    storage: "peakHours",
    section: "theSpace",
    label: "Peak Hours",
  },
  "nightlife.musicFormat": {
    kind: "multi",
    storage: "musicFormat",
    section: "theScene",
    label: "Music",
  },
  "nightlife.touristPresence": {
    kind: "single",
    storage: "touristPresence",
    section: "theScene",
    label: "Tourist Presence",
  },
  "nightlife.dressCode": {
    kind: "multi",
    storage: "dressCode",
    section: "theScene",
    label: "Dress Code",
  },
  "nightlife.energyLevel": {
    kind: "single",
    storage: "energyLevel",
    section: "theScene",
    label: "Energy Level",
  },
  "nightlife.vipAndBottleService": {
    kind: "single",
    storage: "vipAndBottleService",
    section: "theScene",
    label: "VIP & Bottle Service",
  },
  "nightlife.crowdProfile": {
    kind: "single",
    storage: "crowdProfile",
    section: "theScene",
    label: "Age Range",
  },
} as const;

export type NightlifeFieldKey = keyof typeof NIGHTLIFE_FIELD_CONFIG;
export type NightlifeFieldConfig = (typeof NIGHTLIFE_FIELD_CONFIG)[NightlifeFieldKey];

export function isNightlifeFieldKey(value: string): value is NightlifeFieldKey {
  return value in NIGHTLIFE_FIELD_CONFIG;
}

export function getNightlifeFieldConfig(fieldKey: string): NightlifeFieldConfig | undefined {
  return isNightlifeFieldKey(fieldKey) ? NIGHTLIFE_FIELD_CONFIG[fieldKey] : undefined;
}

export function isNightlifeMultiFieldKey(value: string): value is NightlifeFieldKey {
  return isNightlifeFieldKey(value) && NIGHTLIFE_FIELD_CONFIG[value].kind === "multi";
}
