export const LOCATION_KEY_REGEX = /^[a-z0-9-]+(\|[a-z0-9-]+){0,2}$/;

export interface LocationKeyParts {
  country: string;
  city: string;
  neighborhood: string;
}

/**
 * Keep taxonomy slug behavior aligned with server-side location slugification.
 */
export function slugifyTaxonomyPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function parseLocationKey(locationKey: string | null | undefined): LocationKeyParts {
  const [country = "", city = "", neighborhood = ""] = (locationKey ?? "")
    .split("|")
    .map((part) => part.trim());

  return {
    country,
    city,
    neighborhood,
  };
}

export function buildLocationKey(parts: LocationKeyParts): string {
  const country = slugifyTaxonomyPart(parts.country);
  const city = slugifyTaxonomyPart(parts.city);
  const neighborhood = slugifyTaxonomyPart(parts.neighborhood);

  if (!country) return "";
  if (!city) return country;
  if (!neighborhood) return `${country}|${city}`;
  return `${country}|${city}|${neighborhood}`;
}

export function isValidLocationKey(locationKey: string): boolean {
  const trimmed = locationKey.trim();
  return trimmed.length === 0 || LOCATION_KEY_REGEX.test(trimmed);
}
