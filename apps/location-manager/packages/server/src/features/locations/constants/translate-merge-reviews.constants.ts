import path from "node:path";

export const GOOGLE_REVIEWS_DIR = path.join(process.cwd(), "data", "reviews");
export const TRIPADVISOR_REVIEWS_DIR = path.join(process.cwd(), "data", "tripadvisor-reviews");
export const MERGED_REVIEWS_DIR = path.join(process.cwd(), "data", "merged-reviews");

export const MIN_REVIEW_CHAR_COUNT = 150;
export const MIN_REVIEW_DATE_TIMESTAMP = Date.UTC(2023, 0, 1);
