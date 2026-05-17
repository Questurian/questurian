import type {
  MergedReviewsFile,
  MergedReviewsUsability,
  UnifiedReview,
} from "../../types/translate-merge-reviews.types";
import { getLatestMergedReviewsFile, readJsonFile } from "./translate-merge-reviews.repository";

export interface MergedReviewsForLocation {
  reviews: UnifiedReview[];
  usability: MergedReviewsUsability;
  mergedAt: string;
  contentHash: string | null;
}

async function readLatestMergedReviews(locationId: number): Promise<MergedReviewsFile | null> {
  const latestFile = await getLatestMergedReviewsFile(locationId);
  if (!latestFile) {
    return null;
  }

  return readJsonFile<MergedReviewsFile>(latestFile.filepath);
}

export async function getLatestMergedReviewsForLocation(
  locationId: number
): Promise<MergedReviewsForLocation | null> {
  const data = await readLatestMergedReviews(locationId);
  if (!data) {
    return null;
  }

  const usability = data.usability ?? { unusable: false, unusableReason: null };
  const reviews = Array.isArray(data.reviews)
    ? data.reviews.filter(
        (review) => typeof review.review_text === "string" && review.review_text.trim().length > 0
      )
    : [];

  return {
    reviews,
    usability,
    mergedAt: data.mergedAt,
    contentHash: data.contentHash ?? null,
  };
}
