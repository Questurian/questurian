/**
 * Extract TripAdvisor location ID from a TripAdvisor URL.
 *
 * Expected pattern: ...-g<geoId>-d<locationId>-Reviews-...
 */
export function extractTripadvisorLocationId(url: string): string | null {
  const match = url.match(/-d(\d+)-Reviews/i);
  return match ? match[1] : null;
}

export function normalizeTripadvisorUrl(url: string): string {
  return url.trim();
}
