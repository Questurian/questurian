import type { Upload, ImageMetadata, ImageSetUpload } from "../../models/location";
import type { ImageVariantType, ImageSet, ImageVariant, VARIANT_SPECS } from "@questurian/lm-shared";
import { BadRequestError, NotFoundError } from "@shared/errors/http-error";
import { ImageStorageService } from "@server/shared/services/storage/image-storage.service";
import { AltTextApiClient } from "@server/shared/services/external/alt-text-api.client";
import { getLocationById } from "../../repositories/core";
import { saveUpload, getUploadById, deleteUploadById } from "../../repositories/content";
import { createFromUpload, createFromImageSetUpload } from "../geocoding/location-geocoding.helper";
import { extractImageMetadata } from "../../utils/image-metadata-extractor";
import { sanitizeLocationName, getFileExtension } from "../../utils/location-utils";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { VARIANT_SPECS as VARIANT_SPECS_IMPORT } from "@questurian/lm-shared";

export class UploadsService {
  constructor(
    private readonly imageStorage: ImageStorageService,
    private readonly altTextApi: AltTextApiClient
  ) {}

  async addUploadFiles(
    locationId: number,
    files: File[],
    photographerCredit?: string | null
  ): Promise<Upload> {
    if (!locationId) {
      throw new BadRequestError("Location ID required");
    }

    const parentLocation = getLocationById(locationId);
    if (!parentLocation) {
      throw new NotFoundError("Location", locationId);
    }

    if (!files || files.length === 0) {
      throw new BadRequestError("No files provided");
    }

    const timestamp = Date.now();
    const entry = createFromUpload(locationId, photographerCredit);
    const savedId = saveUpload(entry);

    if (typeof savedId === 'number') {
      entry.id = savedId;
    } else {
      throw new Error("Failed to save upload entry");
    }

    const storagePath = this.imageStorage.generateStoragePath({
      baseDir: this.imageStorage["baseImagesDir"],
      locationName: parentLocation.name,
      storageType: "uploads",
      timestamp
    });

    const { savedPaths, errors } = await this.imageStorage.saveUploadedFiles(
      files,
      storagePath
    );

    if (errors.length > 0) {
      console.warn("Some files failed to upload:", errors);
    }

    // REMOVED: Legacy upload fields are no longer stored in database
    // The images, imageMetadata, and altTexts fields have been removed

    return entry;
  }

  /**
   * Generate alt text for an image (used for preview before upload)
   * @param imageBuffer - Image buffer
   * @param filename - Original filename
   * @param format - Image format
   * @returns Generated alt text
   */
  async generateAltText(imageBuffer: Buffer, filename: string, format?: string): Promise<string> {
    try {
      const altText = await this.altTextApi.generateAltText(imageBuffer, filename, format);
      return altText;
    } catch (error) {
      console.warn(`Failed to generate alt text for image ${filename}:`, error);
      throw error;
    }
  }

  /**
   * Add a new multi-variant image set upload
   * @param locationId - Parent location ID
   * @param sourceFile - Original source image file
   * @param variantFiles - Array of 5 variant files (thumbnail, square, wide, portrait, hero)
   * @param photographerCredit - Optional photographer attribution
   * @returns ImageSetUpload with all variants saved
   */
  async addImageSetUpload(
    locationId: number,
    sourceFile: File,
    variantFiles: { type: ImageVariantType; file: File }[],
    photographerCredit?: string | null,
    altText?: string | null
  ): Promise<ImageSetUpload> {
    // 1. Validate inputs
    if (!locationId) {
      throw new BadRequestError("Location ID required");
    }

    const parentLocation = getLocationById(locationId);
    if (!parentLocation) {
      throw new NotFoundError("Location", locationId);
    }

    if (!sourceFile) {
      throw new BadRequestError("Source file required");
    }

    if (!variantFiles || variantFiles.length !== 5) {
      throw new BadRequestError("Exactly 5 variant files required (thumbnail, square, wide, portrait, hero)");
    }

    // Validate all variant types are present
    const requiredTypes: ImageVariantType[] = ['thumbnail', 'square', 'wide', 'portrait', 'hero'];
    const providedTypes = new Set(variantFiles.map(v => v.type));

    for (const type of requiredTypes) {
      if (!providedTypes.has(type)) {
        throw new BadRequestError(`Missing variant type: ${type}`);
      }
    }

    // 2. Create timestamp-based ID and entry
    const timestamp = Date.now();
    const imageSetId = `${timestamp}`;
    const entry = createFromImageSetUpload(locationId);

    // Save entry to get database ID
    const savedId = saveUpload(entry);
    if (typeof savedId === 'number') {
      entry.id = savedId;
    } else {
      throw new Error("Failed to save upload entry");
    }

    // 3. Generate storage path
    const storagePath = this.imageStorage.generateStoragePath({
      baseDir: this.imageStorage["baseImagesDir"],
      locationName: parentLocation.name,
      storageType: "uploads",
      timestamp
    });

    // Ensure directory exists
    await this.imageStorage.ensureDirectoryExists(storagePath);

    // 4. Save source file (always save as WebP)
    const sourceFileName = `source_0.webp`;
    const sourceFilePath = join(storagePath, sourceFileName);

    try {
      await this.saveFileToPath(sourceFile, sourceFilePath);
    } catch (error) {
      console.error("Failed to save source file:", error);
      throw new BadRequestError("Failed to save source file");
    }

    // 4.5. Handle alt text for the source image (before processing variants)
    const relativeSourcePath = sourceFilePath.replace(process.cwd() + "/", "");
    let finalAltText = '';

    if (altText) {
      // Use provided alt text from client
      finalAltText = altText;
    } else {
      // Generate alt text automatically
      try {
        const sourceImageBuffer = await Bun.file(sourceFilePath).arrayBuffer();
        // Extract format from filename for content-type detection
        const fileExtension = this.getFileExtension(sourceFileName).toLowerCase();
        finalAltText = await this.altTextApi.generateAltText(Buffer.from(sourceImageBuffer), sourceFileName, fileExtension);
      } catch (error) {
        console.warn(`Failed to generate alt text for source image ${sourceFileName}:`, error);
        // Continue without alt text
      }
    }

    // 5. Extract source metadata
    const sourceRelativePath = sourceFilePath.replace(process.cwd() + "/", "");
    const sourceMeta = await this.extractMetadataFromFile(sourceRelativePath);

    // 6. Save all variant files and extract metadata
    const variants: ImageVariant[] = [];

    for (const { type, file } of variantFiles) {
      const spec = VARIANT_SPECS_IMPORT[type];
      // Generate filename: {sanitized-location-name}_{variantType}.webp (always WebP)
      const sanitizedName = sanitizeLocationName(parentLocation.name);
      const variantFileName = `${sanitizedName}_${type}.webp`;
      const variantFilePath = join(storagePath, variantFileName);

      try {
        await this.saveFileToPath(file, variantFilePath);

        // Get relative path from cwd
        const relativePath = variantFilePath.replace(process.cwd() + "/", "");

        const meta = await this.extractMetadataFromFile(relativePath);

        variants.push({
          type,
          aspectRatio: spec.label,
          dimensions: {
            width: meta.width,
            height: meta.height,
          },
          path: relativePath,
          size: meta.size,
          format: meta.format,
        });
      } catch (error) {
        console.error(`Failed to save variant ${type}:`, error);
        throw new BadRequestError(`Failed to save variant: ${type}`);
      }
    }

    // 7. Construct ImageSet object
    const imageSet: ImageSet = {
      id: imageSetId,
      sourceImage: {
        path: relativeSourcePath,
        dimensions: {
          width: sourceMeta.width,
          height: sourceMeta.height,
        },
        size: sourceMeta.size,
        format: sourceMeta.format,
      },
      variants,
      photographerCredit: photographerCredit || null,
      altText: finalAltText || undefined,
      created_at: new Date().toISOString(),
    };

    // 8. Update entry with ImageSet and save to database
    entry.imageSet = imageSet;
    saveUpload(entry);

    return entry;
  }

  /**
   * Get file extension from filename
   */
  private getFileExtension(filename: string): string {
    const parts = filename.split('.');
    return parts[parts.length - 1] || 'jpg';
  }

  /**
   * Save a File object to a specific path, converting to WebP format
   */
  private async saveFileToPath(file: File, filePath: string): Promise<void> {
    const { default: sharp } = await import("sharp");
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Convert to WebP using Sharp
    const webpBuffer = await sharp(buffer)
      .webp({ quality: 85 })
      .toBuffer();

    await Bun.write(filePath, webpBuffer);
  }

  /**
   * Extract metadata from a file at the given path
   */
  private async extractMetadataFromFile(filePath: string): Promise<ImageMetadata> {
    try {
      const fullPath = join(process.cwd(), filePath);

      // Check if file exists before attempting extraction
      if (!existsSync(fullPath)) {
        throw new BadRequestError(`Image file not found at: ${filePath}`);
      }

      const meta = await extractImageMetadata(fullPath);
      return meta;
    } catch (error) {
      console.error(`Failed to extract metadata for ${filePath}:`, error);
      // Throw error instead of returning zeros to prevent bad data from being saved
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new BadRequestError(`Failed to extract image metadata: ${errorMessage}`);
    }
  }

  async deleteUpload(id: number): Promise<void> {
    // 1. Get upload to extract file paths
    const upload = getUploadById(id);
    if (!upload) {
      throw new NotFoundError("Upload", id);
    }

    // 2. Delete from database
    const deleted = deleteUploadById(id);
    if (!deleted) {
      throw new Error("Failed to delete upload");
    }

    // 3. Extract path from imageset format (legacy uploads don't store image paths anymore)
    let imagePath: string | null | undefined = null;

    if (upload.format === "imageset" && upload.imageSet) {
      imagePath = upload.imageSet.sourceImage?.path;
    }
    // REMOVED: Legacy uploads no longer store image paths in the database

    if (!imagePath) {
      return; // No files to clean up
    }

    const metadata = this.imageStorage.extractPathMetadata(imagePath);
    if (!metadata) {
      console.warn("Could not extract path metadata", { path: imagePath });
      return;
    }

    // 4. Delete timestamp folder and cleanup empty parents
    try {
      await this.imageStorage.deleteTimestampFolder(metadata.timestampDir);
      await this.imageStorage["cleanupEmptyFolders"](metadata.timestampDir);
    } catch (error) {
      console.error("File deletion failed for upload", { id, error });
    }
  }
}
