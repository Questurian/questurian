import { EnvConfig } from "@server/shared/config/env.config";

export interface AccommodationsApiHints {
  source: "foursquare";
  foursquareId?: string;
  price?: string;
  perfectFor?: string[];
  ac?: "yes" | "no";
  wifi?: "yes" | "no";
  parking?: string[];
  pool?: string[];
}

export interface FoursquareAccommodationsLookupInput {
  name: string;
  address: string;
  lat?: number | null;
  lng?: number | null;
}

interface FoursquareCategory {
  name?: string;
}

interface FoursquarePlace {
  fsq_id?: string;
  name?: string;
  description?: string;
  price?: number;
  categories?: FoursquareCategory[];
  features?: Record<string, unknown>;
  tastes?: string[];
}

const FOURSQUARE_PLACE_FIELDS = [
  "fsq_id",
  "name",
  "description",
  "price",
  "categories",
  "features",
  "tastes",
].join(",");

const PRICE_MAP: Record<number, string> = {
  1: "$",
  2: "$$",
  3: "$$$",
  4: "$$$$",
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getNestedValue(record: Record<string, unknown> | null, path: string[]): unknown {
  let current: unknown = record;

  for (const key of path) {
    const currentRecord = asRecord(current);
    if (!currentRecord) return undefined;
    current = currentRecord[key];
  }

  return current;
}

function isPositiveSignal(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === "number") return value > 0;
  if (value && typeof value === "object") return true;

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return (
      normalized.length > 0 &&
      !["no", "false", "none", "unknown", "not_available", "not available"].includes(normalized)
    );
  }

  return false;
}

function addUnique<T>(target: T[], value: T): void {
  if (!target.includes(value)) {
    target.push(value);
  }
}

function textIncludesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function buildSearchText(place: FoursquarePlace): string {
  const parts = [
    place.name,
    place.description,
    ...(place.tastes ?? []),
    ...(place.categories ?? []).map((category) => category.name),
  ];

  return parts
    .map((part) => (typeof part === "string" ? part : ""))
    .join(" ")
    .toLowerCase();
}

function mapParking(features: Record<string, unknown> | null): string[] {
  const parking = asRecord(getNestedValue(features, ["amenities", "parking"]));
  if (!parking) return [];

  const result: string[] = [];

  if (isPositiveSignal(parking.valet_parking)) addUnique(result, "valet");
  if (isPositiveSignal(parking.street_parking)) addUnique(result, "street");
  if (isPositiveSignal(parking.garage_parking) || isPositiveSignal(parking.garage)) {
    addUnique(result, "garage");
  }
  if (
    isPositiveSignal(parking.parking) ||
    isPositiveSignal(parking.private_lot) ||
    isPositiveSignal(parking.public_lot)
  ) {
    addUnique(result, "onsite");
  }

  return result;
}

export function mapFoursquarePlaceToAccommodationsHints(
  place: FoursquarePlace
): AccommodationsApiHints | null {
  const features = asRecord(place.features);
  const attributes = asRecord(getNestedValue(features, ["attributes"]));
  const amenities = asRecord(getNestedValue(features, ["amenities"]));
  const text = buildSearchText(place);
  const hints: AccommodationsApiHints = {
    source: "foursquare",
    ...(place.fsq_id ? { foursquareId: place.fsq_id } : {}),
  };

  if (place.price && PRICE_MAP[place.price]) {
    hints.price = PRICE_MAP[place.price];
  }

  const perfectFor: string[] = [];
  if (
    isPositiveSignal(attributes?.singles_popular) ||
    textIncludesAny(text, [/\bsolo\b/, /\bsingle traveler/, /\bbusiness traveler/])
  ) {
    addUnique(perfectFor, "Solo");
  }
  if (
    isPositiveSignal(attributes?.romantic) ||
    isPositiveSignal(attributes?.dates_popular) ||
    textIncludesAny(text, [/\bcouples?\b/, /\bromantic\b/, /\bhoneymoon\b/])
  ) {
    addUnique(perfectFor, "Couples");
  }
  if (
    isPositiveSignal(attributes?.groups_popular) ||
    isPositiveSignal(attributes?.families_popular) ||
    textIncludesAny(text, [/\bgroups?\b/, /\bfamil(y|ies)\b/, /\bfamily-friendly\b/])
  ) {
    addUnique(perfectFor, "Groups");
  }
  if (perfectFor.length > 0) {
    hints.perfectFor = perfectFor;
  }

  const wifiValue = getNestedValue(features, ["amenities", "wifi"]);
  const hasNegativeWifiText = textIncludesAny(text, [/\bno wi[- ]?fi\b/, /\bwithout wi[- ]?fi\b/]);
  if (
    !hasNegativeWifiText &&
    (isPositiveSignal(wifiValue) || textIncludesAny(text, [/\bwi[- ]?fi\b/, /\bwlan\b/]))
  ) {
    hints.wifi = "yes";
  }

  const acValue =
    amenities?.air_conditioning ??
    amenities?.air_conditioned ??
    amenities?.["air conditioning"] ??
    amenities?.ac;
  const hasNegativeAcText = textIncludesAny(text, [
    /\bno air conditioning\b/,
    /\bwithout air conditioning\b/,
    /\bno a\/c\b/,
  ]);
  if (
    !hasNegativeAcText &&
    (isPositiveSignal(acValue) ||
      textIncludesAny(text, [
        /\bair conditioning\b/,
        /\bair-conditioned\b/,
        /\bair conditioned\b/,
        /\ba\/c\b/,
      ]))
  ) {
    hints.ac = "yes";
  }

  const parking = mapParking(features);
  if (parking.length > 0) {
    hints.parking = parking;
  }

  const pool: string[] = [];
  const hasNegativePoolText = textIncludesAny(text, [/\bno pool\b/, /\bwithout (a )?pool\b/]);
  if (
    !hasNegativePoolText &&
    textIncludesAny(text, [/\bindoor pool\b/, /\bindoor swimming pool\b/])
  ) {
    addUnique(pool, "indoor");
  }
  if (
    !hasNegativePoolText &&
    textIncludesAny(text, [/\brooftop pool\b/, /\brooftop swimming pool\b/])
  ) {
    addUnique(pool, "rooftop");
  }
  if (
    !hasNegativePoolText &&
    textIncludesAny(text, [/\binfinity pool\b/, /\binfinity-edge pool\b/])
  ) {
    addUnique(pool, "infinity");
  }
  if (
    !hasNegativePoolText &&
    textIncludesAny(text, [/\boutdoor pool\b/, /\boutdoor swimming pool\b/])
  ) {
    addUnique(pool, "outdoor");
  }
  if (
    !hasNegativePoolText &&
    pool.length === 0 &&
    textIncludesAny(text, [/\bswimming pool\b/, /\bpool\b/])
  ) {
    addUnique(pool, "outdoor");
  }
  if (pool.length > 0) {
    hints.pool = pool;
  }

  const hasFieldHints = Boolean(
    hints.price ||
      hints.perfectFor?.length ||
      hints.ac ||
      hints.wifi ||
      hints.parking?.length ||
      hints.pool?.length
  );

  return hasFieldHints ? hints : null;
}

export class FoursquareApiClient {
  private readonly apiKey: string;
  private readonly baseUrl = "https://api.foursquare.com/v3";

  constructor(config: EnvConfig) {
    this.apiKey = config.FOURSQUARE_API_KEY || "";
  }

  isConfigured(): boolean {
    return this.apiKey.trim().length > 0;
  }

  async getAccommodationsHints(
    input: FoursquareAccommodationsLookupInput
  ): Promise<AccommodationsApiHints | null> {
    if (!this.isConfigured()) return null;

    const url = new URL(`${this.baseUrl}/places/match`);
    url.searchParams.set("name", input.name);
    url.searchParams.set("address", input.address);
    url.searchParams.set("fields", FOURSQUARE_PLACE_FIELDS);

    if (typeof input.lat === "number" && typeof input.lng === "number") {
      url.searchParams.set("ll", `${input.lat},${input.lng}`);
    }

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: this.apiKey,
        "X-Places-Api-Version": "1970-01-01",
      },
    });

    if (response.status === 404) return null;

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Foursquare API error: ${response.status} - ${errorText}`);
    }

    const place = (await response.json()) as FoursquarePlace;
    return mapFoursquarePlaceToAccommodationsHints(place);
  }
}
