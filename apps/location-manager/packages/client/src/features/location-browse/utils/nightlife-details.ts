type UnknownRecord = Record<string, unknown>;

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

export interface ParsedNightlifeDetails {
  hasDetails: boolean;
  name: string | null;
  idealFor: string[];
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
  reserveUrl: string | null;
  daytimeRestaurant: string | null;
}

export function parseNightlifeDetails(details: unknown): ParsedNightlifeDetails {
  const root = asRecord(details);
  const touristPresenceValue =
    getSectionValue(root, "theScene", "touristPresence") ??
    getSectionValue(root, "theSpace", "touristPresence");

  return {
    hasDetails: Boolean(root && Object.keys(root).length > 0),
    name: asString(getNestedValue(root, ["name"])),
    idealFor: asStringArray(getNestedValue(root, ["core", "idealFor"])),
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
    reserveUrl: asString(getNestedValue(root, ["reserve_url"])),
    daytimeRestaurant: asString(getNestedValue(root, ["daytime_restaurant"])),
  };
}
