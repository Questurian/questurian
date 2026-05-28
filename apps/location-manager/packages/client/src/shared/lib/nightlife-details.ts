type UnknownRecord = Record<string, unknown>;

export interface ParsedNightlifeDetails {
  hasDetails: boolean;
  name: string | null;
  priceTier: string | null;
  clubType: string | null;
  music: string[];
  venueType: string | null;
  venueSize: string | null;
  spaceLayout: string[];
  vibe: string[];
  peakHours: string | null;
  touristPresence: string | null;
  musicFormat: string[];
  dressCode: string[];
  energyLevel: string | null;
  vipAndBottleService: string | null;
  crowdProfile: string | null;
  location: string | null;
  phone: string | null;
  hours: string | null;
  website: string | null;
  bookingUrl: string | null;
  daytimeRestaurant: string | null;
}

export interface BuildNightlifeDetailsInput {
  name: string;
  priceTier: string;
  clubType: string;
  music: string[];
  venueType: string;
  venueSize: string;
  spaceLayout: string[];
  vibe: string[];
  peakHours: string;
  touristPresence: string;
  musicFormat: string[];
  dressCode: string[];
  energyLevel: string;
  vipAndBottleService: string;
  crowdProfile: string;
  location: string;
  phone: string;
  hours: string;
  website: string;
  bookingUrl: string;
  daytimeRestaurant: string;
}

export interface NightlifeDetailsPayload extends Record<string, unknown> {
  name: string;
  price_tier: string;
  club_type: string;
  music: string[];
  details: {
    theSpace: Record<string, { label: string; value: string | string[] }>;
    theScene: Record<string, { label: string; value: string | string[] }>;
  };
  location: string;
  phone: string;
  hours: string;
  website: string;
  booking_url: string;
  daytime_restaurant: number;
}

const NIGHTLIFE_FIELD_CONFIG = {
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

export interface NightlifeFieldUpdatePayload {
  nightlifeDetails: Record<string, unknown>;
  type?: string;
  priceLevel?: string;
}

function asRecord(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as UnknownRecord;
}

function asString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => asString(item))
      .filter((item): item is string => Boolean(item));
  }

  const single = asString(value);
  return single ? [single] : [];
}

function getNestedValue(record: UnknownRecord | null, path: string[]): unknown {
  if (!record) return undefined;

  let current: unknown = record;
  for (const key of path) {
    const nextRecord = asRecord(current);
    if (!nextRecord) return undefined;
    current = nextRecord[key];
  }

  return current;
}

function getSectionValue(
  details: UnknownRecord | null,
  section: "theSpace" | "theScene",
  key: string
): unknown {
  const raw = getNestedValue(details, ["details", section, key]);
  const rawRecord = asRecord(raw);
  if (rawRecord && "value" in rawRecord) {
    return rawRecord.value;
  }
  return raw;
}

function cloneNightlifeDetails(details: unknown): UnknownRecord {
  if (typeof details === "string") {
    try {
      const parsed = JSON.parse(details);
      const record = asRecord(parsed);
      return record ? (JSON.parse(JSON.stringify(record)) as UnknownRecord) : {};
    } catch {
      return {};
    }
  }

  const record = asRecord(details);
  return record ? (JSON.parse(JSON.stringify(record)) as UnknownRecord) : {};
}

function normalizeSingleValue(value: string | string[]): string {
  if (Array.isArray(value)) {
    return value.find((item) => item.trim().length > 0)?.trim() ?? "";
  }
  return value.trim();
}

function normalizeMultiValue(value: string | string[]): string[] {
  return (Array.isArray(value) ? value : [value])
    .map((item) => item.trim())
    .filter(Boolean);
}

function setNightlifeFieldValue(
  root: UnknownRecord,
  fieldKey: NightlifeFieldKey,
  value: string | string[]
) {
  const config = NIGHTLIFE_FIELD_CONFIG[fieldKey];

  if (!("section" in config)) {
    if (fieldKey === "nightlife.daytimeRestaurant") {
      root[config.storage] = Number(normalizeSingleValue(value) || "0");
      return;
    }

    root[config.storage] = config.kind === "multi" ? normalizeMultiValue(value) : normalizeSingleValue(value);
    return;
  }

  const nextValue =
    config.kind === "multi" ? normalizeMultiValue(value) : normalizeSingleValue(value);
  const detailsRoot = asRecord(root.details) ? { ...(root.details as UnknownRecord) } : {};
  const sectionRoot = asRecord(detailsRoot[config.section])
    ? { ...(detailsRoot[config.section] as UnknownRecord) }
    : {};

  sectionRoot[config.storage] = {
    label: config.label,
    value: nextValue,
  };
  detailsRoot[config.section] = sectionRoot;
  root.details = detailsRoot;
}

export function isNightlifeFieldKey(value: string): value is NightlifeFieldKey {
  return value in NIGHTLIFE_FIELD_CONFIG;
}

export function isNightlifeMultiFieldKey(
  value: string
): value is NightlifeFieldKey {
  return isNightlifeFieldKey(value) && NIGHTLIFE_FIELD_CONFIG[value].kind === "multi";
}

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

export function buildNightlifeDetails(
  input: BuildNightlifeDetailsInput
): NightlifeDetailsPayload {
  return {
    name: input.name,
    price_tier: input.priceTier,
    club_type: input.clubType,
    music: input.music,
    details: {
      theSpace: {
        venueType: { label: "Venue Type", value: input.venueType },
        venueSize: { label: "Venue Size", value: input.venueSize },
        spaceLayout: { label: "Layout", value: input.spaceLayout },
        vibe: { label: "Vibe", value: input.vibe },
        peakHours: { label: "Peak Hours", value: input.peakHours },
      },
      theScene: {
        musicFormat: { label: "Music", value: input.musicFormat },
        touristPresence: { label: "Tourist Presence", value: input.touristPresence },
        dressCode: { label: "Dress Code", value: input.dressCode },
        energyLevel: { label: "Energy Level", value: input.energyLevel },
        vipAndBottleService: {
          label: "VIP & Bottle Service",
          value: input.vipAndBottleService,
        },
        crowdProfile: { label: "Age Range", value: input.crowdProfile },
      },
    },
    location: input.location,
    phone: input.phone,
    hours: input.hours,
    website: input.website,
    booking_url: input.bookingUrl,
    daytime_restaurant: Number(input.daytimeRestaurant),
  };
}

export function buildNightlifeFieldUpdatePayload(
  currentDetails: unknown,
  fieldKey: NightlifeFieldKey,
  value: string | string[]
): NightlifeFieldUpdatePayload {
  const nightlifeDetails = cloneNightlifeDetails(currentDetails);
  setNightlifeFieldValue(nightlifeDetails, fieldKey, value);

  return {
    nightlifeDetails,
    ...(fieldKey === "nightlife.clubType"
      ? { type: normalizeSingleValue(value) }
      : {}),
    ...(fieldKey === "nightlife.priceTier"
      ? { priceLevel: normalizeSingleValue(value) }
      : {}),
  };
}
