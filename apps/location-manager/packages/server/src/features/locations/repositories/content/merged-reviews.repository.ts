import type {
  MergedReviewsFile,
  MinimalReview,
  Review2BlogExportReview,
} from "../../types/translate-merge-reviews.types";
import { getLatestMergedReviewsFile, readJsonFile } from "./translate-merge-reviews.repository";

async function readLatestMergedReviews(locationId: number): Promise<MergedReviewsFile | null> {
  const latestFile = await getLatestMergedReviewsFile(locationId);
  if (!latestFile) {
    return null;
  }

  return readJsonFile<MergedReviewsFile>(latestFile.filepath);
}

function formatReviewExportDate(value: string | null): string {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const dateMatch = trimmed.match(/^\d{4}-\d{2}-\d{2}/);
  return dateMatch ? dateMatch[0]! : trimmed;
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

export async function getLatestReview2BlogReviews(
  locationId: number
): Promise<Review2BlogExportReview[] | null> {
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
      reviewId: review.id,
      source: review.source,
      date: formatReviewExportDate(review.review_datetime_utc),
      rating: review.rating ?? 0,
      text: review.review_text ?? "",
    }));
}
