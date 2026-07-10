import { existsSync } from "node:fs";
import { mkdir, rm, readdir, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sanitizeUploadedImageBuffer } from "../../utils/image-upload-sanitizer";
import { extractImageMetadata } from "../../utils/image-metadata-extractor";

export interface ImageStorageConfig {
  baseDir: string;
  locationName: string;
  storageType: "instagram" | "uploads";
  timestamp: number | string;
}

export interface SaveImageResult {
  savedPaths: string[];
  errors: Array<{ index: number; error: string }>;
}

export interface SavedImageSource {
  path: string;
  metadata: { width: number; height: number; size: number; format: string };
}

export interface PathMetadata {
  locationName: string;
  storageType: "instagram" | "uploads";
  timestamp: string;
  timestampDir: string; // Full path to timestamp folder
}

export interface OrphanedFileScanResult {
  totalOrphanedFiles: number;
  totalSizeBytes: number;
  orphanedByLocation: Map<string, {
    paths: string[];
    sizeBytes: number;
  }>;
}

export interface DeletionResult {
  deletedCount: number;
  failedCount: number;
  errors: Array<{ path: string; error: string }>;
}

export class ImageStorageService {
  private readonly serverRoot: string;
  private readonly repoRoot: string;
  private readonly baseImagesDir: string;

  constructor(baseImagesDir?: string) {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    this.serverRoot = resolve(currentDir, "../../../../../");
    this.repoRoot = resolve(this.serverRoot, "../../../..");
    this.baseImagesDir = this.resolveImagesBaseDir(baseImagesDir ?? process.env.IMAGES_PATH);
  }

  private resolveImagesBaseDir(rawPath?: string): string {
    const defaultImagesPath = join(this.serverRoot, "data/images");
    if (!rawPath) {
      return defaultImagesPath;
    }

    if (isAbsolute(rawPath)) {
      return rawPath;
    }

    const normalized = rawPath.replace(/^\.\//, "");
    if (
      normalized.startsWith("packages/") ||
      normalized.startsWith("apps/")
    ) {
      if (normalized === "packages/server/data/images") {
        return join(this.serverRoot, "data/images");
      }
      return resolve(this.repoRoot, normalized);
    }

    return resolve(this.serverRoot, normalized);
  }

  private toStoredPath(absolutePath: string): string {
    const relativePath = relative(this.serverRoot, absolutePath).replace(/\\/g, "/");
    if (relativePath.startsWith("..")) {
      return absolutePath;
    }
    return relativePath;
  }

  private toAbsolutePath(pathValue: string): string {
    if (pathValue.startsWith("/")) {
      return pathValue;
    }

    const normalized = pathValue.replace(/^\.\//, "");
    if (normalized.startsWith("data/")) {
      return resolve(this.serverRoot, normalized);
    }
    if (normalized.startsWith("packages/") || normalized.startsWith("apps/")) {
      if (normalized === "packages/server/data/images") {
        return join(this.serverRoot, "data/images");
      }
      return resolve(this.repoRoot, normalized);
    }
    return resolve(this.serverRoot, normalized);
  }

  /**
   * Generate a clean, filesystem-safe name from location name
   */
  sanitizeLocationName(locationName: string): string {
    return locationName
      .replace(/[^a-z0-9]/gi, "_")
      .toLowerCase()
      .substring(0, 30);
  }

  /**
   * Generate full storage path for a given configuration
   */
  generateStoragePath(config: ImageStorageConfig): string {
    const cleanName = this.sanitizeLocationName(config.locationName);
    return join(
      config.baseDir || this.baseImagesDir,
      cleanName,
      config.storageType,
      config.timestamp.toString()
    );
  }

  createStoragePath(
    locationName: string,
    storageType: ImageStorageConfig["storageType"],
    timestamp: ImageStorageConfig["timestamp"],
  ): string {
    return this.generateStoragePath({
      baseDir: this.baseImagesDir,
      locationName,
      storageType,
      timestamp,
    });
  }

  /**
   * Ensure directory structure exists
   */
  async ensureDirectoryExists(path: string): Promise<void> {
    const parts = path.replace(this.baseImagesDir, "").split("/").filter(Boolean);
    let current = this.baseImagesDir;

    // Ensure base directory exists
    if (!existsSync(current)) {
      await mkdir(current, { recursive: true });
    }

    // Create each subdirectory
    for (const part of parts) {
      current = join(current, part);
      if (!existsSync(current)) {
        await mkdir(current, { recursive: true });
      }
    }
  }

  /**
   * Save images from URLs to filesystem
   */
  async saveImagesFromUrls(
    imageUrls: string[],
    storagePath: string,
    fileExtension: string = "jpg"
  ): Promise<SaveImageResult> {
    await this.ensureDirectoryExists(storagePath);

    const savedPaths: string[] = [];
    const errors: Array<{ index: number; error: string }> = [];

    const fetchWithRetry = async (url: string): Promise<Response> => {
      // First attempt: plain fetch
      let res = await fetch(url);
      if (res.ok) return res;

      // Retry once with browser-like headers (helps with some Instagram CDN URLs)
      res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          "Referer": "https://www.instagram.com/",
        },
      });
      return res;
    };

    for (let i = 0; i < imageUrls.length; i++) {
      const imgUrl = imageUrls[i];
      try {
        const imgRes = await fetchWithRetry(imgUrl!);
        if (!imgRes.ok) {
          throw new Error(`HTTP ${imgRes.status}`);
        }

        const filename = `image_${i}.${fileExtension}`;
        const filePath = join(storagePath, filename);
        await Bun.write(filePath, await imgRes.blob());

        savedPaths.push(this.toStoredPath(filePath));
      } catch (err) {
        errors.push({
          index: i,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }

    return { savedPaths, errors };
  }

  async saveSanitizedImageFromUrl(url: string, storagePath: string): Promise<SavedImageSource> {
    await this.ensureDirectoryExists(storagePath);
    let response = await fetch(url);
    if (!response.ok) {
      response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          Referer: "https://www.instagram.com/",
        },
      });
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const raw = Buffer.from(await response.arrayBuffer());
    const sanitized = await sanitizeUploadedImageBuffer(raw);
    const absolutePath = join(storagePath, "source_0.webp");
    await Bun.write(absolutePath, sanitized);
    return {
      path: this.toStoredPath(absolutePath),
      metadata: await extractImageMetadata(absolutePath),
    };
  }

  /**
   * Save uploaded File objects to filesystem, converting to WebP format
   */
  async saveUploadedFiles(
    files: File[],
    storagePath: string
  ): Promise<SaveImageResult> {
    await this.ensureDirectoryExists(storagePath);

    const savedPaths: string[] = [];
    const errors: Array<{ index: number; error: string }> = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file) {
        errors.push({
          index: i,
          error: "File is undefined"
        });
        continue;
      }

      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const webpBuffer = await sanitizeUploadedImageBuffer(buffer);

        const filename = `image_${i}.webp`;
        const filePath = join(storagePath, filename);
        await Bun.write(filePath, webpBuffer);

        savedPaths.push(this.toStoredPath(filePath));
      } catch (err) {
        errors.push({
          index: i,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }

    return { savedPaths, errors };
  }

  /**
   * Read image file and return as Buffer
   */
  async readImage(filePath: string): Promise<Buffer> {
    // Handle both relative and absolute paths
    const absolutePath = this.toAbsolutePath(filePath);

    const file = Bun.file(absolutePath);

    if (!await file.exists()) {
      throw new Error(`Image file not found: ${filePath}`);
    }

    const arrayBuffer = await file.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Extract location name, storage type, and timestamp from path
   * Input: "packages/server/data/images/coco_bambu/instagram/1766982300989/image_0.jpg"
   * Output: { locationName: "coco_bambu", storageType: "instagram", timestamp: "1766982300989", timestampDir: "..." }
   */
  extractPathMetadata(relativePath: string): PathMetadata | null {
    try {
      // Normalize path separators
      const normalizedPath = relativePath.replace(/\\/g, "/");
      const parts = normalizedPath.split("/");

      // Find the "images" directory in the path
      const imagesIndex = parts.indexOf("images");
      if (imagesIndex === -1 || imagesIndex + 3 >= parts.length) {
        console.warn("Invalid path format - missing images directory or insufficient parts", { relativePath });
        return null;
      }

      const locationName = parts[imagesIndex + 1];
      const storageType = parts[imagesIndex + 2];
      const timestamp = parts[imagesIndex + 3];

      // Validate extracted parts
      if (!locationName || !storageType || !timestamp) {
        console.warn("Invalid path format - missing required parts", { relativePath });
        return null;
      }

      // Validate storage type
      if (storageType !== "instagram" && storageType !== "uploads") {
        console.warn("Invalid storage type", { storageType, relativePath });
        return null;
      }

      // Build absolute path to timestamp directory
      const timestampDir = join(
        this.serverRoot,
        parts.slice(0, imagesIndex + 4).join("/")
      );

      return {
        locationName,
        storageType,
        timestamp,
        timestampDir
      };
    } catch (error) {
      console.error("Error extracting path metadata", { relativePath, error });
      return null;
    }
  }

  /**
   * Delete timestamp folder and all contents
   * Example: data/images/coco_bambu/instagram/1766982300989/
   */
  async deleteTimestampFolder(timestampDir: string): Promise<void> {
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
  async deleteLocationFolder(locationName: string): Promise<void> {
    try {
      const locationFolder = join(this.baseImagesDir, locationName);

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
  private async cleanupEmptyFolders(startPath: string): Promise<void> {
    try {
      let currentPath = startPath;
      const baseDir = this.baseImagesDir;

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
   * Scan filesystem for files not referenced in database
   */
  async scanOrphanedFiles(): Promise<OrphanedFileScanResult> {
    const orphanedByLocation = new Map<string, { paths: string[]; sizeBytes: number }>();
    let totalOrphanedFiles = 0;
    let totalSizeBytes = 0;

    try {
      // Get all database image paths
      const dbPaths = await this.getAllDatabaseImagePaths();
      const dbPathSet = new Set(dbPaths);

      // Scan filesystem
      if (!existsSync(this.baseImagesDir)) {
        return { totalOrphanedFiles: 0, totalSizeBytes: 0, orphanedByLocation };
      }

      const locationDirs = await readdir(this.baseImagesDir);

      for (const locationName of locationDirs) {
        const locationPath = join(this.baseImagesDir, locationName);
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
              const relativePath = this.toStoredPath(filePath);

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
  async deleteOrphanedFiles(paths: string[]): Promise<DeletionResult> {
    const result: DeletionResult = {
      deletedCount: 0,
      failedCount: 0,
      errors: []
    };

    for (const relativePath of paths) {
      try {
        const absolutePath = this.toAbsolutePath(relativePath);

        if (!existsSync(absolutePath)) {
          console.warn("File already deleted", { relativePath });
          result.deletedCount++;
          continue;
        }

        await rm(absolutePath, { force: true });
        console.info("Deleted orphaned file", { relativePath });
        result.deletedCount++;

        // Extract metadata and cleanup empty folders
        const metadata = this.extractPathMetadata(relativePath);
        if (metadata) {
          await this.cleanupEmptyFolders(metadata.timestampDir);
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

  /**
   * Get all image paths from database
   * This is a helper method to scan all tables for image paths
   */
  private async getAllDatabaseImagePaths(): Promise<string[]> {
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
}
