import path from "node:path";

export const GOOGLE_REVIEWS_DIR = path.join(process.cwd(), "data", "reviews");
export const TRIPADVISOR_REVIEWS_DIR = path.join(process.cwd(), "data", "tripadvisor-reviews");
export const MERGED_REVIEWS_DIR = path.join(process.cwd(), "data", "merged-reviews");

export const MIN_REVIEW_CHAR_COUNT = 150;
export const MIN_REVIEW_AGE_YEARS = 3;
export const MIN_USABLE_REVIEW_COUNT = 5;
export const TRANSLATOR_VERSION = "v1";
export const REVIEW_SAMPLE_FOR_AI = 20;

export function resolveMinReviewDateTimestamp(now: Date = new Date()): number {
  const cutoff = new Date(Date.UTC(now.getUTCFullYear() - MIN_REVIEW_AGE_YEARS, now.getUTCMonth(), now.getUTCDate()));
  cutoff.setUTCHours(0, 0, 0, 0);
  return cutoff.getTime();
}
