// Resolve a TripAdvisor restaurant page URL from a name + coordinates using SerpAPI's
// tripadvisor search engine. Returns the URL of the first result that looks like a
// TripAdvisor Restaurant_Review page, or null if no confident match.

interface SerpApiTripAdvisorSearchResponse {
  search_metadata?: { status?: string };
  results?: Array<{
    title?: string;
    link?: string;
    url?: string;
    location_id?: string | number;
  }>;
  error?: string;
}

const TRIPADVISOR_RESTAURANT_URL_PATTERN = /tripadvisor\.[a-z.]+\/Restaurant_Review-/i;

export async function searchTripadvisorUrl(
  apiKey: string,
  name: string,
  lat: number | null | undefined,
  lng: number | null | undefined
): Promise<string | null> {
  if (!apiKey) return null;

  const trimmedName = name.trim();
  if (!trimmedName) return null;

  const queryParams = new URLSearchParams();
  queryParams.set("engine", "tripadvisor");
  queryParams.set("q", trimmedName);
  if (typeof lat === "number" && typeof lng === "number") {
    queryParams.set("ll", `${lat},${lng}`);
  }
  queryParams.set("api_key", apiKey);

  const url = `https://serpapi.com/search?${queryParams.toString()}`;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const data = (await response.json()) as SerpApiTripAdvisorSearchResponse;
    if (data.error || !Array.isArray(data.results)) return null;

    for (const result of data.results) {
      const candidate = result.link ?? result.url;
      if (typeof candidate === "string" && TRIPADVISOR_RESTAURANT_URL_PATTERN.test(candidate)) {
        return candidate;
      }
    }

    return null;
  } catch {
    return null;
  }
}
