import { apiGet, apiPost } from "./client";
import { API_ENDPOINTS } from "./config";
import type {
  Category,
  TranslateMergeReviewsResponse,
  MergedReviewsStatusResponse,
  MergedReviewsReportResponse,
} from "./types";

export const locationsMergedReviewsApi = {
  async translateAndMergeReviews(
    category: Category,
    id: number
  ): Promise<TranslateMergeReviewsResponse["data"]> {
    return apiPost<TranslateMergeReviewsResponse["data"]>(
      API_ENDPOINTS.TRANSLATE_MERGE_REVIEWS(category, id),
      {}
    );
  },

  async getMergedReviewsStatus(
    category: Category,
    id: number
  ): Promise<MergedReviewsStatusResponse["data"]> {
    return apiGet<MergedReviewsStatusResponse["data"]>(
      API_ENDPOINTS.MERGED_REVIEWS_STATUS(category, id)
    );
  },

  async getMergedReviewsReport(
    category: Category,
    id: number
  ): Promise<MergedReviewsReportResponse["data"]> {
    return apiGet<MergedReviewsReportResponse["data"]>(
      API_ENDPOINTS.MERGED_REVIEWS_REPORT(category, id)
    );
  },
};
