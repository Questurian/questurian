import type { ReviewSource } from "../../../../types/translate-merge-reviews.types";
import type {
  PipelineDependencies,
  PipelineLocation,
  PipelineProgressUpdate,
  PipelineSourceFetchResult,
} from "../../../../types/reviews-pipeline.types";
import { selectRequestedSources } from "../../../../utils/reviews-pipeline-source-selection.utils";
import { fetchGoogleSource } from "./google-source-fetch.service";
import { fetchTripadvisorSource } from "./tripadvisor-source-fetch.service";

export async function fetchSelectedSources(
  locationId: number,
  location: PipelineLocation,
  sources: ReviewSource[],
  deps: PipelineDependencies,
  onProgress?: (update: PipelineProgressUpdate) => void
): Promise<PipelineSourceFetchResult> {
  const warnings: PipelineSourceFetchResult["warnings"] = [];
  const fetched: PipelineSourceFetchResult["fetched"] = {};
  const { wantsGoogle, wantsTripadvisor } = selectRequestedSources(sources);

  let googleFetched = false;
  let tripadvisorFetched = false;

  if (wantsGoogle) {
    const googleResult = await fetchGoogleSource(locationId, location, deps, onProgress);
    if (googleResult.warning) {
      warnings.push(googleResult.warning);
    }
    if (googleResult.payload) {
      fetched.google = googleResult.payload;
      googleFetched = true;
    }
  }

  if (wantsTripadvisor) {
    const tripadvisorResult = await fetchTripadvisorSource(locationId, location, deps, onProgress);
    if (tripadvisorResult.warning) {
      warnings.push(tripadvisorResult.warning);
    }
    if (tripadvisorResult.payload) {
      fetched.tripadvisor = tripadvisorResult.payload;
      tripadvisorFetched = true;
    }
  }

  return {
    warnings,
    fetched,
    googleFetched,
    tripadvisorFetched,
    anyFetched: googleFetched || tripadvisorFetched,
  };
}
