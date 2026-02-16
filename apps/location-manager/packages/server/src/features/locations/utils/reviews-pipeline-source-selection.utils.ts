import type { ReviewSource } from "../types/translate-merge-reviews.types";

export function selectRequestedSources(sources: ReviewSource[]) {
  const normalizedSources = new Set(sources.map((source) => source.toLowerCase()));
  return {
    wantsGoogle: normalizedSources.has("google"),
    wantsTripadvisor: normalizedSources.has("tripadvisor"),
  };
}
