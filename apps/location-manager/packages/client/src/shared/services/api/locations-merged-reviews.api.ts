import { apiGet, apiPost } from "./client";
import { API_ENDPOINTS } from "./config";
import type {
  TranslateMergeReviewsResponse,
  MergedReviewsStatusResponse,
  MergedReviewsReportResponse,
} from "./types";

export const locationsMergedReviewsApi = {
  async translateAndMergeReviews(
    id: number
  ): Promise<TranslateMergeReviewsResponse["data"]> {
    return apiPost<TranslateMergeReviewsResponse["data"]>(
      API_ENDPOINTS.TRANSLATE_MERGE_REVIEWS(id),
      {}
    );
  },

  async getMergedReviewsStatus(
    id: number
  ): Promise<MergedReviewsStatusResponse["data"]> {
    return apiGet<MergedReviewsStatusResponse["data"]>(
      API_ENDPOINTS.MERGED_REVIEWS_STATUS(id)
    );
  },

  async getMergedReviewsReport(
    id: number
  ): Promise<MergedReviewsReportResponse["data"]> {
    return apiGet<MergedReviewsReportResponse["data"]>(
      API_ENDPOINTS.MERGED_REVIEWS_REPORT(id)
    );
  },
};
