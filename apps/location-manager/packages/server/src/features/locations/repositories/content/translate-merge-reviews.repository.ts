import path from "node:path";
import { existsSync } from "node:fs";
import { mkdir, readdir, rename, unlink } from "node:fs/promises";
import {
  GOOGLE_REVIEWS_DIR,
  MERGED_REVIEWS_DIR,
  TRIPADVISOR_REVIEWS_DIR,
} from "../../constants/translate-merge-reviews.constants";
import type { ReviewFileReference } from "../../types/translate-merge-reviews.types";

const MERGED_REVIEWS_RETENTION = 3;

async function ensureDir(dir: string): Promise<void> {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

function sortNewestFirst(files: string[]): string[] {
  return [...files].sort().reverse();
}

export function mergedReviewsDirectoryExists(): boolean {
  return existsSync(MERGED_REVIEWS_DIR);
}

export async function ensureMergedReviewsDir(): Promise<void> {
  await ensureDir(MERGED_REVIEWS_DIR);
}

export async function getLatestGoogleReviewsFile(locationId: number): Promise<string | null> {
  if (!existsSync(GOOGLE_REVIEWS_DIR)) {
    return null;
  }

  const files = await readdir(GOOGLE_REVIEWS_DIR);
  const locationFiles = sortNewestFirst(
    files.filter((f) => f.startsWith(`reviews_location_${locationId}_`) && f.endsWith(".json"))
  );

  if (locationFiles.length === 0) {
    return null;
  }

  return path.join(GOOGLE_REVIEWS_DIR, locationFiles[0]!);
}

export async function getAllTripAdvisorReviewFiles(locationId: number): Promise<string[]> {
  if (!existsSync(TRIPADVISOR_REVIEWS_DIR)) {
    return [];
  }

  const files = await readdir(TRIPADVISOR_REVIEWS_DIR);
  const languageLatest = new Map<string, { file: string; timestamp: number }>();

  for (const file of files) {
    if (!file.startsWith(`tripadvisor_reviews_${locationId}_`) || !file.endsWith(".json")) {
      continue;
    }

    const match = file.match(/^tripadvisor_reviews_\d+_([a-z-]+)_(\d+)\.json$/i);
    if (!match) continue;

    const language = match[1]!;
    const timestamp = parseInt(match[2]!, 10);

    const existing = languageLatest.get(language);
    if (!existing || timestamp > existing.timestamp) {
      languageLatest.set(language, { file, timestamp });
    }
  }

  return Array.from(languageLatest.values()).map((v) => path.join(TRIPADVISOR_REVIEWS_DIR, v.file));
}

export async function readTextFile(filepath: string): Promise<string> {
  return Bun.file(filepath).text();
}

export async function readJsonFile<T>(filepath: string): Promise<T> {
  const content = await readTextFile(filepath);
  return JSON.parse(content) as T;
}

export async function writeJsonFile(filepath: string, data: unknown): Promise<void> {
  await Bun.write(filepath, JSON.stringify(data, null, 2));
}

async function writeJsonFileAtomic(filepath: string, data: unknown): Promise<void> {
  const tmpPath = `${filepath}.tmp`;
  await Bun.write(tmpPath, JSON.stringify(data, null, 2));
  await rename(tmpPath, filepath);
}

async function pruneOldMergedReviews(locationId: number, keep: number): Promise<void> {
  if (!existsSync(MERGED_REVIEWS_DIR)) return;
  const files = await readdir(MERGED_REVIEWS_DIR);
  const merged = sortNewestFirst(
    files.filter((f) => f.startsWith(`merged_reviews_${locationId}_`) && f.endsWith(".json"))
  );
  const rejects = sortNewestFirst(
    files.filter((f) => f.startsWith(`rejects_report_${locationId}_`) && f.endsWith(".json"))
  );
  const mergedToDelete = merged.slice(keep);
  const rejectsToDelete = rejects.slice(keep);
  await Promise.all(
    [...mergedToDelete, ...rejectsToDelete].map(async (f) => {
      try {
        await unlink(path.join(MERGED_REVIEWS_DIR, f));
      } catch (error) {
        console.warn(`[Translate & Merge] Failed to prune ${f}:`, error);
      }
    })
  );
}

export function createMergedReviewsFilename(locationId: number, timestamp: number): string {
  return `merged_reviews_${locationId}_${timestamp}.json`;
}

export function createRejectsReportFilename(locationId: number, timestamp: number): string {
  return `rejects_report_${locationId}_${timestamp}.json`;
}

export function extractTimestampFromFilename(filename: string): string | null {
  return filename.match(/_(\d+)\.json$/)?.[1] ?? null;
}

export async function saveMergedReviewsFile(
  locationId: number,
  timestamp: number,
  data: unknown
): Promise<ReviewFileReference> {
  await ensureMergedReviewsDir();
  const filename = createMergedReviewsFilename(locationId, timestamp);
  const filepath = path.join(MERGED_REVIEWS_DIR, filename);
  await writeJsonFileAtomic(filepath, data);
  await pruneOldMergedReviews(locationId, MERGED_REVIEWS_RETENTION);
  return { filename, filepath };
}

export async function saveRejectsReportFile(
  locationId: number,
  timestamp: number,
  data: unknown
): Promise<ReviewFileReference> {
  await ensureMergedReviewsDir();
  const filename = createRejectsReportFilename(locationId, timestamp);
  const filepath = path.join(MERGED_REVIEWS_DIR, filename);
  await writeJsonFileAtomic(filepath, data);
  await pruneOldMergedReviews(locationId, MERGED_REVIEWS_RETENTION);
  return { filename, filepath };
}

export async function getLatestMergedReviewsFile(locationId: number): Promise<ReviewFileReference | null> {
  if (!existsSync(MERGED_REVIEWS_DIR)) {
    return null;
  }

  const files = await readdir(MERGED_REVIEWS_DIR);
  const locationFiles = sortNewestFirst(
    files.filter((f) => f.startsWith(`merged_reviews_${locationId}_`) && f.endsWith(".json"))
  );

  if (locationFiles.length === 0) {
    return null;
  }

  const filename = locationFiles[0]!;
  return {
    filename,
    filepath: path.join(MERGED_REVIEWS_DIR, filename),
  };
}

export async function getLatestRejectsReportFile(locationId: number): Promise<ReviewFileReference | null> {
  if (!existsSync(MERGED_REVIEWS_DIR)) {
    return null;
  }

  const files = await readdir(MERGED_REVIEWS_DIR);
  const locationFiles = sortNewestFirst(
    files.filter((f) => f.startsWith(`rejects_report_${locationId}_`) && f.endsWith(".json"))
  );

  if (locationFiles.length === 0) {
    return null;
  }

  const filename = locationFiles[0]!;
  return {
    filename,
    filepath: path.join(MERGED_REVIEWS_DIR, filename),
  };
}

export async function getRejectsReportFileByTimestamp(
  locationId: number,
  timestamp: string
): Promise<ReviewFileReference | null> {
  if (!existsSync(MERGED_REVIEWS_DIR)) {
    return null;
  }

  const filename = `rejects_report_${locationId}_${timestamp}.json`;
  const filepath = path.join(MERGED_REVIEWS_DIR, filename);

  if (!existsSync(filepath)) {
    return null;
  }

  return { filename, filepath };
}
