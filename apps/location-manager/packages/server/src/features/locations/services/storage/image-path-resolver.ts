import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { ImageStorageConfig, PathMetadata } from "./image-storage.types";

/**
 * Owns the root directories images live under and every translation between
 * stored (repo-relative) paths and absolute filesystem paths.
 *
 * Stored paths are relative to the server package root so database rows stay
 * portable across checkouts; absolute paths are what the filesystem calls need.
 */
export class ImagePathResolver {
  readonly serverRoot: string;
  readonly repoRoot: string;
  readonly baseImagesDir: string;

  constructor(currentDir: string, baseImagesDir?: string) {
    this.serverRoot = resolve(currentDir, "../../../../../");
    this.repoRoot = resolve(this.serverRoot, "../../../..");
    this.baseImagesDir = this.resolveImagesBaseDir(baseImagesDir);
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

  toStoredPath(absolutePath: string): string {
    const relativePath = relative(this.serverRoot, absolutePath).replace(/\\/g, "/");
    if (relativePath.startsWith("..")) {
      return absolutePath;
    }
    return relativePath;
  }

  toAbsolutePath(pathValue: string): string {
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
}
