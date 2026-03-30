import { parseLocationKey, slugifyTaxonomyPart } from "../../../shared/lib/taxonomy-location";

export interface PayloadSyncFilterOption {
  value: string;
  label: string;
  count: number;
}

export interface PayloadSyncFilterOptions {
  options: PayloadSyncFilterOption[];
  unspecifiedCount: number;
}

export interface PayloadSyncLocationScope {
  location: string | null;
  locationKey: string | null;
  country: string | null;
  city: string | null;
  neighborhood: string | null;
}

function normalizeValue(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parseDisplayLocation(location: string | null | undefined): {
  country: string | null;
  city: string | null;
  neighborhood: string | null;
} {
  const [country = "", city = "", neighborhood = ""] = (location ?? "")
    .split(">")
    .map((part) => slugifyTaxonomyPart(part.trim()));

  return {
    country: normalizeValue(country),
    city: normalizeValue(city),
    neighborhood: normalizeValue(neighborhood),
  };
}

export function extractPayloadSyncLocationScope(location: {
  location: string | null;
  locationKey: string | null;
  country: string | null;
}): PayloadSyncLocationScope {
  const locationKey = normalizeValue(location.locationKey);
  const parsed = parseLocationKey(locationKey);
  const parsedDisplayLocation = parseDisplayLocation(location.location);

  return {
    location: normalizeValue(location.location),
    locationKey,
    country:
      normalizeValue(parsed.country) ??
      normalizeValue(location.country) ??
      parsedDisplayLocation.country,
    city: normalizeValue(parsed.city) ?? parsedDisplayLocation.city,
    neighborhood: normalizeValue(parsed.neighborhood) ?? parsedDisplayLocation.neighborhood,
  };
}

export function buildFacetOptions<T>(
  items: T[],
  getValue: (item: T) => string | null | undefined,
  getLabel: (value: string) => string
): PayloadSyncFilterOptions {
  const countMap = new Map<string, number>();
  let unspecifiedCount = 0;

  items.forEach((item) => {
    const value = normalizeValue(getValue(item));

    if (!value) {
      unspecifiedCount += 1;
      return;
    }

    countMap.set(value, (countMap.get(value) ?? 0) + 1);
  });

  const options = Array.from(countMap.entries())
    .map(([value, count]) => ({
      value,
      label: getLabel(value),
      count,
    }))
    .sort((left, right) => left.label.localeCompare(right.label));

  return {
    options,
    unspecifiedCount,
  };
}

export function matchesFacetFilter(
  value: string | null | undefined,
  filter: string,
  unspecifiedFilter: string
): boolean {
  if (filter === "all") {
    return true;
  }

  const normalizedValue = normalizeValue(value);

  if (filter === unspecifiedFilter) {
    return !normalizedValue;
  }

  return normalizedValue === filter;
}
