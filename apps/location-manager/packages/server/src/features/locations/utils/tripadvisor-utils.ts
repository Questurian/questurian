/**
 * Extract TripAdvisor location ID from a TripAdvisor URL.
 *
 * Expected pattern: ...-g<geoId>-d<locationId>-Reviews-...
 */
export function extractTripadvisorLocationId(url: string): string | null {
  const match = url.match(/-d(\d+)-Reviews/i);
  return match?.[1] ?? null;
}

export function normalizeTripadvisorUrl(url: string): string {
  return url.trim();
}

/**
 * Normalize a TripAdvisor list-like field (meal types, cuisines, features)
 * into a deduplicated array of non-empty strings.
 */
export function normalizeTripadvisorStringList(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const normalized = value
    .map((item) => {
      if (typeof item === "string") {
        const trimmed = item.trim();
        return trimmed.length > 0 ? trimmed : null;
      }

      if (item && typeof item === "object") {
        const maybeText = (item as { text?: unknown }).text;
        if (typeof maybeText === "string" && maybeText.trim().length > 0) {
          return maybeText.trim();
        }

        const maybeName = (item as { name?: unknown }).name;
        if (typeof maybeName === "string" && maybeName.trim().length > 0) {
          return maybeName.trim();
        }
      }

      return null;
    })
    .filter((item): item is string => item !== null);

  if (normalized.length === 0) {
    return null;
  }

  return Array.from(new Set(normalized));
}

/**
 * Parse a JSON-encoded string array from the locations table.
 */
export function parseTripadvisorStringListJson(value?: string | null): string[] | null {
  if (!value) {
    return null;
  }

  try {
    return normalizeTripadvisorStringList(JSON.parse(value));
  } catch {
    return null;
  }
}

const EXCLUDED_FEATURE_TOKENS = new Set([
  "delivery",
  "takeout",
  "seating",
  "wheelchairaccessible",
  "fullbar",
  "acceptscreditcards",
  "tableservice",
  "livemusic",
  "servesalcohol",
  "freewifi",
  "drivethru",
  "dogfriendly",
]);

function normalizeFeatureToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const FEATURE_REWRITE_BY_TOKEN: Record<string, string> = {
  americanexpress: "AmEx accepted",
  mastercard: "Mastercard accepted",
  visa: "Visa accepted",
};

/**
 * Remove TripAdvisor feature values we don't want to persist.
 */
export function filterTripadvisorFeatures(features: string[] | null): string[] | null {
  if (!features || features.length === 0) {
    return null;
  }

  const filtered = features
    .map((feature) => {
      const token = normalizeFeatureToken(feature);
      if (EXCLUDED_FEATURE_TOKENS.has(token)) {
        return null;
      }

      return FEATURE_REWRITE_BY_TOKEN[token] ?? feature;
    })
    .filter((feature): feature is string => feature !== null);

  const deduped = Array.from(new Set(filtered));
  return deduped.length > 0 ? deduped : null;
}
