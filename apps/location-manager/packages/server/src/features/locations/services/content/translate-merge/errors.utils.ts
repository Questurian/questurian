import { TranslateMergeError } from "./errors";

export function getMissingMergedReviewsDirectoryError(): TranslateMergeError {
  return new TranslateMergeError("No merged reviews found. Please run translate & merge first.", 404);
}

export function getMissingMergedReviewsForLocationError(): TranslateMergeError {
  return new TranslateMergeError(
    "No merged reviews found for this location. Please run translate & merge first.",
    404
  );
}

export function getMissingRejectsDirectoryError(): TranslateMergeError {
  return new TranslateMergeError("No rejects report found. Please run translate & merge first.", 404);
}

export function getMissingRejectsForLocationError(): TranslateMergeError {
  return new TranslateMergeError(
    "No rejects report found for this location. This means no duplicates were detected during the merge.",
    404
  );
}
