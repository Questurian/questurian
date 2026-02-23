import { EnvConfig } from "@server/shared/config/env.config";
import type { PipelineDependencies } from "../../../../types/reviews-pipeline.types";
import { ReviewsApiClient } from "../../../integrations/clients/reviews-api.client";
import { TripAdvisorReviewsApiClient } from "../../../integrations/clients/tripadvisor-reviews-api.client";
import { createGooglePipelineSourceDependency } from "./google-dependency.service";
import { createTripadvisorPipelineSourceDependency } from "./tripadvisor-dependency.service";
import { createPipelineMergeDependency } from "./merge-dependency.service";

const config = EnvConfig.getInstance();
const googleDependency = createGooglePipelineSourceDependency(new ReviewsApiClient(config));
const tripadvisorDependency = createTripadvisorPipelineSourceDependency(new TripAdvisorReviewsApiClient(config));
const mergeDependency = createPipelineMergeDependency();

export function createReviewsPipelineDependencies(): PipelineDependencies {
  return {
    isGoogleConfigured: googleDependency.isConfigured,
    isTripadvisorConfigured: tripadvisorDependency.isConfigured,
    fetchGoogle: googleDependency.fetch,
    fetchTripadvisor: tripadvisorDependency.fetch,
    merge: mergeDependency.merge,
  };
}
