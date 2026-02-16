import type { MergedReviewsFile, MinimalReview } from "../../types/translate-merge-reviews.types";
import { getLatestMergedReviewsFile, readJsonFile } from "./translate-merge-reviews.repository";

export async function getLatestMinimalMergedReviews(locationId: number): Promise<MinimalReview[] | null> {
  const latestFile = await getLatestMergedReviewsFile(locationId);
  if (!latestFile) {
    return null;
  }

  const data = await readJsonFile<MergedReviewsFile>(latestFile.filepath);
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
