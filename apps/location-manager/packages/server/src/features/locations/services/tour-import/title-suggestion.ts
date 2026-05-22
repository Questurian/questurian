export interface TourTitleSuggestionInput {
  sourceTitle: string;
  description?: string | null;
  provider?: string | null;
  duration?: string | null;
  price?: string | null;
  locationKey?: string | null;
}

export function cleanDisplayTitle(value: string): string {
  return value
    .replace(/\s*\|\s*Viator\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function suggestTourDisplayTitle(
  input: TourTitleSuggestionInput
): Promise<{ displayTitle: string; source: "ai" | "fallback"; reason?: string }> {
  const fallback = cleanDisplayTitle(input.sourceTitle);

  // Keep v1 independent from a new AI API contract. The server endpoint is in
  // place; when the Python service gets a freeform title endpoint, this becomes
  // one call and the fallback remains unchanged.
  return {
    displayTitle: fallback,
    source: "fallback",
    reason: "AI title endpoint is not configured; using cleaned source title.",
  };
}
