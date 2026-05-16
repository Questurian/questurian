import { REVIEW_SAMPLE_FOR_AI } from "../../constants/translate-merge-reviews.constants";
import type {
  MergedReviewsFile,
  MergedReviewsUsability,
  MinimalReview,
} from "../../types/translate-merge-reviews.types";
import { getLatestMergedReviewsFile, readJsonFile } from "./translate-merge-reviews.repository";

export interface MergedReviewsAiSample {
  reviews: MinimalReview[];
  usability: MergedReviewsUsability;
}

async function readLatestMergedReviews(locationId: number): Promise<MergedReviewsFile | null> {
  const latestFile = await getLatestMergedReviewsFile(locationId);
  if (!latestFile) {
    return null;
  }

  return readJsonFile<MergedReviewsFile>(latestFile.filepath);
}

export async function getLatestMinimalMergedReviews(locationId: number): Promise<MinimalReview[] | null> {
  const data = await readLatestMergedReviews(locationId);
  if (!data) {
    return null;
  }

  if (!Array.isArray(data.reviews)) {
    return [];
  }

  return data.reviews
    .filter((review) => typeof review.review_text === "string" && review.review_text.trim().length > 0)
    .map((review) => ({
      text: review.review_text ?? "",
      rating: review.rating ?? 0,
      date: review.review_datetime_utc ?? "",
    }));
}

export async function getLatestMergedReviewsAiSample(
  locationId: number
): Promise<MergedReviewsAiSample | null> {
  const data = await readLatestMergedReviews(locationId);
  if (!data) {
    return null;
  }

  const usability = data.usability ?? { unusable: false, unusableReason: null };
  const reviews = Array.isArray(data.reviews)
    ? data.reviews
        .filter(
          (review) => typeof review.review_text === "string" && review.review_text.trim().length > 0
        )
        .slice(0, REVIEW_SAMPLE_FOR_AI)
        .map((review) => ({
          text: review.review_text ?? "",
          rating: review.rating ?? 0,
          date: review.review_datetime_utc ?? "",
        }))
    : [];

  return { reviews, usability };
}
