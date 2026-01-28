import { useMutation, useQueryClient } from "@tanstack/react-query";
import { locationsApi } from "../locations.api";
import type {
  FetchReviewsPipelineRequest,
  ReviewsPipelineJobStatus,
  ReviewsPipelineResult,
} from "../types";
import { REVIEWS_STATUS_QUERY_KEY } from "./useReviews";
import { TRIPADVISOR_REVIEWS_STATUS_QUERY_KEY } from "./useTripAdvisorReviews";
import { MERGED_REVIEWS_STATUS_QUERY_KEY } from "./useMergedReviews";

interface UseFetchReviewsPipelineOptions {
  locationId: number;
  onSuccess?: (data: ReviewsPipelineResult) => void;
  onError?: (error: Error) => void;
  onProgress?: (status: ReviewsPipelineJobStatus) => void;
  onSettled?: () => void;
}

const POLL_INTERVAL_MS = 1500;
const MAX_POLL_TIME_MS = 1000 * 60 * 10; // 10 minutes

export function useFetchReviewsPipeline(options: UseFetchReviewsPipelineOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: FetchReviewsPipelineRequest) => {
      const start = await locationsApi.fetchReviewsPipeline(options.locationId, params);
      const jobId = start.jobId;
      const startedAt = Date.now();

      while (true) {
        const status = await locationsApi.getReviewsPipelineStatus(options.locationId, jobId);
        options.onProgress?.(status);

        if (status.status === "completed") {
          return status.result as ReviewsPipelineResult;
        }

        if (status.status === "failed") {
          throw new Error(status.error || "Pipeline failed");
        }

        if (Date.now() - startedAt > MAX_POLL_TIME_MS) {
          throw new Error("Pipeline timed out");
        }

        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: [REVIEWS_STATUS_QUERY_KEY, options.locationId],
      });
      queryClient.invalidateQueries({
        queryKey: [TRIPADVISOR_REVIEWS_STATUS_QUERY_KEY, options.locationId],
      });
      queryClient.invalidateQueries({
        queryKey: [MERGED_REVIEWS_STATUS_QUERY_KEY, options.locationId],
      });
      options.onSuccess?.(data);
    },
    onError: (error) => {
      options.onError?.(error as Error);
    },
    onSettled: () => {
      options.onSettled?.();
    },
  });
}
