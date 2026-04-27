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

function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "1"].includes(normalized)) return true;
    if (["false", "no", "0"].includes(normalized)) return false;
  }
  return null;
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

export interface AccommodationsDetailsPayload extends Record<string, unknown> {
  core: {
    name: string;
    price: string;
    district: string;
    type: string;
  };
  the_stay: {
    perfect_for: string[];
    kid_friendly: boolean;
    ac: boolean;
    wifi: boolean;
    extra_guest_fee: boolean;
    parking: string[];
    breakfast_served: boolean;
  };
  the_experience: {
    vibe: string[];
    workspace: string[];
    restaurant: boolean;
    pool: string[];
    rooftop_lounge: boolean;
    jacuzzi: string[];
    gym: string;
  };
  the_details: {
    address: string;
    walkability: string;
    check_in_time: string;
    check_out_time: string;
    phone: string;
    website_url: string;
    booking_url: string;
    google_maps_url: string;
  };
}

export interface BuildAccommodationsDetailsInput {
  name: string;
  price: string;
  district: string;
  type: string;
  perfectFor: string[];
  kidFriendly: boolean;
  ac: boolean;
  wifi: boolean;
  extraGuestFee: boolean;
  parking: string[];
  breakfastServed: boolean;
  vibe: string[];
  workspace: string[];
  restaurant: boolean;
  pool: string[];
  rooftopLounge: boolean;
  jacuzzi: string[];
  gym: string;
  address: string;
  walkability: string;
  checkInTime: string;
  checkOutTime: string;
  phone: string;
  websiteUrl: string;
  bookingUrl: string;
  googleMapsUrl: string;
}

export function buildAccommodationsDetails(
  input: BuildAccommodationsDetailsInput
): AccommodationsDetailsPayload {
  return {
    core: {
      name: input.name,
      price: input.price,
      district: input.district,
      type: input.type,
    },
    the_stay: {
      perfect_for: input.perfectFor,
      kid_friendly: input.kidFriendly,
      ac: input.ac,
      wifi: input.wifi,
      extra_guest_fee: input.extraGuestFee,
      parking: input.parking,
      breakfast_served: input.breakfastServed,
    },
    the_experience: {
      vibe: input.vibe,
      workspace: input.workspace,
      restaurant: input.restaurant,
      pool: input.pool,
      rooftop_lounge: input.rooftopLounge,
      jacuzzi: input.jacuzzi,
      gym: input.gym,
    },
    the_details: {
      address: input.address,
      walkability: input.walkability,
      check_in_time: input.checkInTime,
      check_out_time: input.checkOutTime,
      phone: input.phone,
      website_url: input.websiteUrl,
      booking_url: input.bookingUrl,
      google_maps_url: input.googleMapsUrl,
    },
  };
}

export interface ParsedAccommodationsDetails {
  hasDetails: boolean;
  coreName: string | null;
  corePrice: string | null;
  coreDistrict: string | null;
  coreType: string | null;
  perfectFor: string[];
  kidFriendly: boolean | null;
  ac: boolean | null;
  wifi: boolean | null;
  extraGuestFee: boolean | null;
  parking: string[];
  breakfastServed: boolean | null;
  vibe: string[];
  workspace: string[];
  restaurant: boolean | null;
  pool: string[];
  rooftopLounge: boolean | null;
  jacuzzi: string[];
  gym: string | null;
  address: string | null;
  walkability: string | null;
  checkInTime: string | null;
  checkOutTime: string | null;
  phone: string | null;
  websiteUrl: string | null;
  bookingUrl: string | null;
  googleMapsUrl: string | null;
}

export function parseAccommodationsDetails(details: unknown): ParsedAccommodationsDetails {
  const root = asRecord(details);

  return {
    hasDetails: Boolean(root && Object.keys(root).length > 0),
    coreName: asString(getNestedValue(root, ["core", "name"])),
    corePrice: asString(getNestedValue(root, ["core", "price"])),
    coreDistrict: asString(getNestedValue(root, ["core", "district"])),
    coreType: asString(getNestedValue(root, ["core", "type"])),
    perfectFor: asStringArray(getNestedValue(root, ["the_stay", "perfect_for"])),
    kidFriendly: asBoolean(getNestedValue(root, ["the_stay", "kid_friendly"])),
    ac: asBoolean(getNestedValue(root, ["the_stay", "ac"])),
    wifi: asBoolean(getNestedValue(root, ["the_stay", "wifi"])),
    extraGuestFee: asBoolean(getNestedValue(root, ["the_stay", "extra_guest_fee"])),
    parking: asStringArray(getNestedValue(root, ["the_stay", "parking"])),
    breakfastServed: asBoolean(getNestedValue(root, ["the_stay", "breakfast_served"])),
    vibe: asStringArray(getNestedValue(root, ["the_experience", "vibe"])),
    workspace: asStringArray(getNestedValue(root, ["the_experience", "workspace"])),
    restaurant: asBoolean(getNestedValue(root, ["the_experience", "restaurant"])),
    pool: asStringArray(getNestedValue(root, ["the_experience", "pool"])),
    rooftopLounge: asBoolean(getNestedValue(root, ["the_experience", "rooftop_lounge"])),
    jacuzzi: asStringArray(getNestedValue(root, ["the_experience", "jacuzzi"])),
    gym: asString(getNestedValue(root, ["the_experience", "gym"])),
    address: asString(getNestedValue(root, ["the_details", "address"])),
    walkability: asString(getNestedValue(root, ["the_details", "walkability"])),
    checkInTime: asString(getNestedValue(root, ["the_details", "check_in_time"])),
    checkOutTime: asString(getNestedValue(root, ["the_details", "check_out_time"])),
    phone: asString(getNestedValue(root, ["the_details", "phone"])),
    websiteUrl: asString(getNestedValue(root, ["the_details", "website_url"])),
    bookingUrl: asString(getNestedValue(root, ["the_details", "booking_url"])),
    googleMapsUrl: asString(getNestedValue(root, ["the_details", "google_maps_url"])),
  };
}
