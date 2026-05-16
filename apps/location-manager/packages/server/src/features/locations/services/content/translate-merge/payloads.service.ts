import {
  extractTimestampFromFilename,
  getLatestMergedReviewsFile,
  getLatestRejectsReportFile,
  getRejectsReportFileByTimestamp,
  mergedReviewsDirectoryExists,
  readJsonFile,
  readTextFile,
} from "../../../repositories/content/translate-merge-reviews.repository";
import type {
  MergedReviewsDownloadPayload,
  MergedReviewsFile,
  MergedReviewsReportPayload,
  MergedReviewsStatusPayload,
  RejectsReportFile,
} from "../../../types/translate-merge-reviews.types";
import {
  getMissingMergedReviewsDirectoryError,
  getMissingMergedReviewsForLocationError,
  getMissingRejectsDirectoryError,
  getMissingRejectsForLocationError,
} from "./errors.utils";
import { toMinimalReviews } from "./helpers.utils";

export async function getMergedReviewsDownloadPayload(
  locationId: number
): Promise<MergedReviewsDownloadPayload> {
  if (!mergedReviewsDirectoryExists()) {
    throw getMissingMergedReviewsDirectoryError();
  }

  const mergedFile = await getLatestMergedReviewsFile(locationId);
  if (!mergedFile) {
    throw getMissingMergedReviewsForLocationError();
  }

  const mergedData = await readJsonFile<MergedReviewsFile>(mergedFile.filepath);
  const minimalReviews = toMinimalReviews(mergedData.reviews);

  return {
    filename: `reviews_${locationId}.json`,
    content: JSON.stringify(minimalReviews, null, 2),
  };
}

export async function getMergedReviewsReportPayload(
  locationId: number
): Promise<MergedReviewsReportPayload> {
  if (!mergedReviewsDirectoryExists()) {
    throw getMissingMergedReviewsDirectoryError();
  }

  const mergedFile = await getLatestMergedReviewsFile(locationId);
  if (!mergedFile) {
    throw getMissingMergedReviewsForLocationError();
  }

  const mergedData = await readJsonFile<MergedReviewsFile>(mergedFile.filepath);
  const timestamp = extractTimestampFromFilename(mergedFile.filename);
  let rejectsSummary = null;

  if (timestamp) {
    const rejectsFile = await getRejectsReportFileByTimestamp(locationId, timestamp);
    if (rejectsFile) {
      const rejectsData = await readJsonFile<RejectsReportFile>(rejectsFile.filepath);
      rejectsSummary = {
        totalRejected: rejectsData.summary.totalRejected,
        replacedWithEnglish: rejectsData.summary.replacedWithEnglish,
        rejectedNonEnglish: rejectsData.summary.rejectedNonEnglish,
      };
    }
  }

  return {
    locationId: mergedData.locationId,
    mergedAt: mergedData.mergedAt,
    stats: mergedData.stats,
    usability: mergedData.usability ?? { unusable: false, unusableReason: null },
    rejectsReport: rejectsSummary,
  };
}

export async function getRejectsReportDownloadPayload(
  locationId: number
): Promise<MergedReviewsDownloadPayload> {
  if (!mergedReviewsDirectoryExists()) {
    throw getMissingRejectsDirectoryError();
  }

  const rejectsFile = await getLatestRejectsReportFile(locationId);
  if (!rejectsFile) {
    throw getMissingRejectsForLocationError();
  }

  return {
    filename: rejectsFile.filename,
    content: await readTextFile(rejectsFile.filepath),
  };
}

export async function getMergedReviewsStatusPayload(
  locationId: number
): Promise<MergedReviewsStatusPayload> {
  if (!mergedReviewsDirectoryExists()) {
    return {
      hasMergedReviews: false,
      filename: null,
      mergedAt: null,
      stats: null,
      usability: null,
    };
  }

  const mergedFile = await getLatestMergedReviewsFile(locationId);
  if (!mergedFile) {
    return {
      hasMergedReviews: false,
      filename: null,
      mergedAt: null,
      stats: null,
      usability: null,
    };
  }

  const mergedData = await readJsonFile<MergedReviewsFile>(mergedFile.filepath);
  return {
    hasMergedReviews: true,
    filename: mergedFile.filename,
    mergedAt: mergedData.mergedAt,
    stats: mergedData.stats,
    usability: mergedData.usability ?? { unusable: false, unusableReason: null },
  };
}
