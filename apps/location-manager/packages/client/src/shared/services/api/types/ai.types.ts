export interface NeighborhoodDescriptionGenerationResponse {
  description: string;
  source?: "ai" | "fallback";
}
