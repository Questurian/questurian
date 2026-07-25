import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ImagePathResolver } from "./image-path-resolver";
import * as writer from "./image-writer";
import * as cleanup from "./image-orphan-cleanup";
import type {
  ImageStorageConfig,
  OrphanedFileScanResult,
  DeletionResult,
  SaveImageResult,
  SavedImageSource,
  PathMetadata,
} from "./image-storage.types";

export type {
  ImageStorageConfig,
  SaveImageResult,
  SavedImageSource,
  PathMetadata,
  OrphanedFileScanResult,
  DeletionResult,
};

/**
 * Filesystem storage for location images.
 *
 * Path translation lives in {@link ImagePathResolver}, writing in
 * `./image-writer`, and orphan scanning/deletion in `./image-orphan-cleanup`.
 * This class composes them behind the service interface the DI container and
 * consuming services expect.
 */
export class ImageStorageService {
  private readonly paths: ImagePathResolver;

  /**
   * Retained as instance members because `uploads.service.ts` and
   * `instagram.service.ts` reach past `private` via bracket indexing
   * (`imageStorage["baseImagesDir"]`, `imageStorage["cleanupEmptyFolders"]`).
   * Dropping them would resolve to `undefined` at runtime, not fail to compile.
   */
  private readonly baseImagesDir: string;

  constructor(baseImagesDir?: string) {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    this.paths = new ImagePathResolver(currentDir, baseImagesDir ?? process.env.IMAGES_PATH);
    this.baseImagesDir = this.paths.baseImagesDir;
  }

  private async cleanupEmptyFolders(startPath: string): Promise<void> {
    return cleanup.cleanupEmptyFolders(this.paths, startPath);
  }

  sanitizeLocationName(locationName: string): string {
    return this.paths.sanitizeLocationName(locationName);
  }

  generateStoragePath(config: ImageStorageConfig): string {
    return this.paths.generateStoragePath(config);
  }

  createStoragePath(
    locationName: string,
    storageType: ImageStorageConfig["storageType"],
    timestamp: ImageStorageConfig["timestamp"],
  ): string {
    return this.generateStoragePath({
      baseDir: this.paths.baseImagesDir,
      locationName,
      storageType,
      timestamp,
    });
  }

  async ensureDirectoryExists(path: string): Promise<void> {
    return this.paths.ensureDirectoryExists(path);
  }

  extractPathMetadata(relativePath: string): PathMetadata | null {
    return this.paths.extractPathMetadata(relativePath);
  }

  async saveImagesFromUrls(
    imageUrls: string[],
    storagePath: string,
    fileExtension: string = "jpg"
  ): Promise<SaveImageResult> {
    return writer.saveImagesFromUrls(this.paths, imageUrls, storagePath, fileExtension);
  }

  async saveSanitizedImageFromUrl(url: string, storagePath: string): Promise<SavedImageSource> {
    return writer.saveSanitizedImageFromUrl(this.paths, url, storagePath);
  }

  async saveSanitizedImageFromFile(localPath: string, storagePath: string): Promise<SavedImageSource> {
    return writer.saveSanitizedImageFromFile(this.paths, localPath, storagePath);
  }

  async saveUploadedFiles(files: File[], storagePath: string): Promise<SaveImageResult> {
    return writer.saveUploadedFiles(this.paths, files, storagePath);
  }

  async readImage(filePath: string): Promise<Buffer> {
    return writer.readImage(this.paths, filePath);
  }

  async deleteTimestampFolder(timestampDir: string): Promise<void> {
    return cleanup.deleteTimestampFolder(timestampDir);
  }

  async deleteLocationFolder(locationName: string): Promise<void> {
    return cleanup.deleteLocationFolder(this.paths, locationName);
  }

  async scanOrphanedFiles(): Promise<OrphanedFileScanResult> {
    return cleanup.scanOrphanedFiles(this.paths);
  }

  async deleteOrphanedFiles(paths: string[]): Promise<DeletionResult> {
    return cleanup.deleteOrphanedFiles(this.paths, paths);
  }
}
