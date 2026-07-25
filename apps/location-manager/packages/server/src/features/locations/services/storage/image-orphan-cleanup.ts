import { existsSync } from "node:fs";
import { rm, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { ImagePathResolver } from "./image-path-resolver";
import type { DeletionResult, OrphanedFileScanResult } from "./image-storage.types";

/**
 * Delete timestamp folder and all contents
 * Example: data/images/coco_bambu/instagram/1766982300989/
 */
export async function deleteTimestampFolder(timestampDir: string): Promise<void> {
  try {
    if (!existsSync(timestampDir)) {
      console.info("Timestamp folder already deleted", { timestampDir });
      return;
    }

    await rm(timestampDir, { recursive: true, force: true });
    console.info("Deleted timestamp folder", { timestampDir });
  } catch (error) {
    console.error("Failed to delete timestamp folder", { timestampDir, error });
    // Don't throw - graceful degradation
  }
}

/**
 * Delete entire location folder
 * Example: data/images/coco_bambu/
 */
export async function deleteLocationFolder(
  paths: ImagePathResolver,
  locationName: string
): Promise<void> {
  try {
    const locationFolder = join(paths.baseImagesDir, locationName);

    if (!existsSync(locationFolder)) {
      console.info("Location folder already deleted", { locationFolder });
      return;
    }

    await rm(locationFolder, { recursive: true, force: true });
    console.info("Deleted location folder", { locationFolder });
  } catch (error) {
    console.error("Failed to delete location folder", { locationName, error });
    // Don't throw - graceful degradation
  }
}

/**
 * Cleanup empty parent folders recursively (bottom-up)
 * Deletes timestamp → storageType → location if empty
 */
export async function cleanupEmptyFolders(paths: ImagePathResolver, startPath: string): Promise<void> {
  try {
    let currentPath = startPath;
    const baseDir = paths.baseImagesDir;

    // Traverse up to 3 levels: timestamp → storageType → location
    for (let i = 0; i < 3; i++) {
      // Stop if we've reached the base images directory
      if (currentPath === baseDir || !currentPath.startsWith(baseDir)) {
        break;
      }

      // Check if directory exists
      if (!existsSync(currentPath)) {
        // Already deleted, move up
        currentPath = join(currentPath, "..");
        continue;
      }

      // Check if directory is empty
      const entries = await readdir(currentPath);
      if (entries.length === 0) {
        console.info("Deleting empty folder", { currentPath });
        await rm(currentPath, { recursive: true, force: true });
      } else {
        // Directory not empty, stop cleanup
        break;
      }

      // Move up one level
      currentPath = join(currentPath, "..");
    }
  } catch (error) {
    console.error("Error during empty folder cleanup", { startPath, error });
    // Don't throw - best effort cleanup
  }
}

/**
 * Get all image paths from database
 * This is a helper method to scan all tables for image paths
 */
async function getAllDatabaseImagePaths(): Promise<string[]> {
  const paths: string[] = [];

  try {
    // Import getDb here to avoid circular dependencies
    const { getDb } = await import("@server/shared/db/client");
    const db = getDb();

    // Get paths from instagram_embeds table
    const instagramEmbeds = db.query("SELECT images FROM instagram_embeds WHERE images IS NOT NULL").all() as Array<{ images: string }>;
    for (const embed of instagramEmbeds) {
      if (embed.images) {
        const images = JSON.parse(embed.images);
        paths.push(...images);
      }
    }

    // Get paths from uploads table (legacy format)
    const uploads = db.query("SELECT images, imageSets FROM uploads WHERE images IS NOT NULL OR imageSets IS NOT NULL").all() as Array<{ images: string | null; imageSets: string | null }>;
    for (const upload of uploads) {
      // Legacy format
      if (upload.images) {
        const images = JSON.parse(upload.images);
        paths.push(...images);
      }

      // ImageSet format
      if (upload.imageSets) {
        const imageSet = JSON.parse(upload.imageSets);
        // Add source image
        if (imageSet.sourceImage?.path) {
          paths.push(imageSet.sourceImage.path);
        }
        // Add variants
        if (imageSet.variants) {
          for (const variant of imageSet.variants) {
            if (variant.path) {
              paths.push(variant.path);
            }
          }
        }
      }
    }
  } catch (error) {
    console.error("Error fetching database image paths", { error });
  }

  return paths;
}

/**
 * Scan filesystem for files not referenced in database
 */
export async function scanOrphanedFiles(resolver: ImagePathResolver): Promise<OrphanedFileScanResult> {
  const orphanedByLocation = new Map<string, { paths: string[]; sizeBytes: number }>();
  let totalOrphanedFiles = 0;
  let totalSizeBytes = 0;

  try {
    // Get all database image paths
    const dbPaths = await getAllDatabaseImagePaths();
    const dbPathSet = new Set(dbPaths);

    // Scan filesystem
    if (!existsSync(resolver.baseImagesDir)) {
      return { totalOrphanedFiles: 0, totalSizeBytes: 0, orphanedByLocation };
    }

    const locationDirs = await readdir(resolver.baseImagesDir);

    for (const locationName of locationDirs) {
      const locationPath = join(resolver.baseImagesDir, locationName);
      const locationStat = await stat(locationPath);

      if (!locationStat.isDirectory()) continue;

      // Scan storage types (instagram/uploads)
      const storageTypes = await readdir(locationPath);

      for (const storageType of storageTypes) {
        if (storageType !== "instagram" && storageType !== "uploads") continue;

        const storageTypePath = join(locationPath, storageType);
        const storageTypeStat = await stat(storageTypePath);

        if (!storageTypeStat.isDirectory()) continue;

        // Scan timestamp folders
        const timestamps = await readdir(storageTypePath);

        for (const timestamp of timestamps) {
          const timestampPath = join(storageTypePath, timestamp);
          const timestampStat = await stat(timestampPath);

          if (!timestampStat.isDirectory()) continue;

          // Scan files in timestamp folder
          const files = await readdir(timestampPath);

          for (const file of files) {
            const filePath = join(timestampPath, file);
            const fileStat = await stat(filePath);

            if (!fileStat.isFile()) continue;

            // Convert to relative path
            const relativePath = resolver.toStoredPath(filePath);

            // Check if path exists in database
            if (!dbPathSet.has(relativePath)) {
              // Orphaned file found
              const existing = orphanedByLocation.get(locationName) || { paths: [], sizeBytes: 0 };
              existing.paths.push(relativePath);
              existing.sizeBytes += fileStat.size;
              orphanedByLocation.set(locationName, existing);

              totalOrphanedFiles++;
              totalSizeBytes += fileStat.size;
            }
          }
        }
      }
    }
  } catch (error) {
    console.error("Error scanning for orphaned files", { error });
  }

  return {
    totalOrphanedFiles,
    totalSizeBytes,
    orphanedByLocation
  };
}

/**
 * Delete orphaned files
 */
export async function deleteOrphanedFiles(
  resolver: ImagePathResolver,
  paths: string[]
): Promise<DeletionResult> {
  const result: DeletionResult = {
    deletedCount: 0,
    failedCount: 0,
    errors: []
  };

  for (const relativePath of paths) {
    try {
      const absolutePath = resolver.toAbsolutePath(relativePath);

      if (!existsSync(absolutePath)) {
        console.warn("File already deleted", { relativePath });
        result.deletedCount++;
        continue;
      }

      await rm(absolutePath, { force: true });
      console.info("Deleted orphaned file", { relativePath });
      result.deletedCount++;

      // Extract metadata and cleanup empty folders
      const metadata = resolver.extractPathMetadata(relativePath);
      if (metadata) {
        await cleanupEmptyFolders(resolver, metadata.timestampDir);
      }
    } catch (error) {
      console.error("Failed to delete orphaned file", { relativePath, error });
      result.failedCount++;
      result.errors.push({
        path: relativePath,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return result;
}
