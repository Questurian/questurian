import type { Upload, ImageMetadata, ImageSetUpload } from "../../models/location";
import type {
  ImageVariantType,
  ImageSet,
  ImageVariant,
  VariantCropRegion,
} from "@questurian/lm-shared";

type VariantUpload = {
  type: ImageVariantType;
  file: File;
  cropRegion?: VariantCropRegion;
};
import { BadRequestError, NotFoundError } from "@shared/errors/http-error";
import { ImageStorageService } from "../storage/image-storage.service";
import { AltTextApiClient } from "./clients/alt-text-api.client";
import { getLocationById, updateLocationById } from "../../repositories/core";
import { saveUpload, getUploadById, deleteUploadById } from "../../repositories/content";
import { createFromUpload, createFromImageSetUpload } from "./factories/upload.factory";
import { extractImageMetadata } from "../../utils/image-metadata-extractor";
import { sanitizeUploadedImageBuffer, UPLOAD_WEBP_QUALITY } from "../../utils/image-upload-sanitizer";
import { sanitizeLocationName, getFileExtension } from "../../utils/location-utils";
import { join, relative } from "node:path";
import { existsSync } from "node:fs";
import { VARIANT_SPECS as VARIANT_SPECS_IMPORT } from "@questurian/lm-shared";

const REQUIRED_VARIANT_TYPES: ImageVariantType[] = [
  "thumbnail",
  "square",
  "wide",
  "open_graph",
  "editorial",
  "portrait",
  "hero",
];
const REQUIRED_VARIANT_COUNT = REQUIRED_VARIANT_TYPES.length;

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
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(
        `[AltText][Vertex] Failed to generate preview alt text`,
        { filename, format, error: errorMessage }
      );
      throw error;
    }
  }

  /**
   * Add a new multi-variant image set upload
   * @param locationId - Parent location ID
   * @param sourceFile - Original source image file
   * @param variantFiles - Array of all configured variant files
   * @param photographerCredit - Optional photographer attribution
   * @returns ImageSetUpload with all variants saved
   */
  async addImageSetUpload(
    locationId: number,
    sourceFile: File,
    variantFiles: VariantUpload[],
    photographerCredit: string,
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

    if (!variantFiles || variantFiles.length !== REQUIRED_VARIANT_COUNT) {
      throw new BadRequestError(
        `Exactly ${REQUIRED_VARIANT_COUNT} variant files required (${REQUIRED_VARIANT_TYPES.join(", ")})`
      );
    }

    const normalizedPhotographerCredit = photographerCredit.trim();
    if (!normalizedPhotographerCredit) {
      throw new BadRequestError("Photographer credit is required");
    }

    // Validate all variant types are present
    const providedTypes = new Set(variantFiles.map(v => v.type));

    for (const type of REQUIRED_VARIANT_TYPES) {
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
      const sourceImageBuffer = await Bun.file(sourceFilePath).arrayBuffer();
      // Extract format from filename for content-type detection
      const fileExtension = this.getFileExtension(sourceFileName).toLowerCase();
      finalAltText = await this.generateAltTextOptional(
        Buffer.from(sourceImageBuffer),
        sourceFileName,
        fileExtension
      );
    }

    // 5. Extract source metadata
    const sourceRelativePath = sourceFilePath.replace(process.cwd() + "/", "");
    const sourceMeta = await this.extractMetadataFromFile(sourceRelativePath);

    // 6. Save all variant files and extract metadata
    const variants: ImageVariant[] = [];

    for (const { type, file, cropRegion } of variantFiles) {
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
          ...(cropRegion ? { cropRegion } : {}),
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
      photographerCredit: normalizedPhotographerCredit,
      altText: finalAltText || undefined,
      created_at: new Date().toISOString(),
    };

    // 8. Update entry with ImageSet and save to database
    entry.imageSet = imageSet;
    saveUpload(entry);
    this.touchLocationUpdatedAt(locationId);

    return entry;
  }

  async updateUploadPhotographerCredit(uploadId: number, photographerCredit: string): Promise<Upload> {
    const normalizedCredit = photographerCredit.trim();
    if (!normalizedCredit) {
      throw new BadRequestError("Photographer credit is required");
    }

    const upload = getUploadById(uploadId);
    if (!upload) {
      throw new NotFoundError("Upload", uploadId);
    }

    if (upload.format !== "imageset" || !upload.imageSet) {
      throw new BadRequestError("Only image-set uploads support photographer credit updates");
    }

    upload.imageSet.photographerCredit = normalizedCredit;
    const saved = saveUpload(upload);
    if (!saved) {
      throw new Error("Failed to save upload photographer credit");
    }

    const updatedUpload = getUploadById(uploadId);
    if (!updatedUpload) {
      throw new NotFoundError("Upload", uploadId);
    }

    this.touchLocationUpdatedAt(updatedUpload.location_id);

    return updatedUpload;
  }

  async reprocessUploadVariants(uploadId: number): Promise<Upload> {
    if (!uploadId || Number.isNaN(uploadId)) {
      throw new BadRequestError("Upload ID required");
    }

    const upload = getUploadById(uploadId);
    if (!upload) {
      throw new NotFoundError("Upload", uploadId);
    }

    if (upload.format !== "imageset" || !upload.imageSet) {
      throw new BadRequestError("Only image-set uploads support variant reprocessing");
    }

    const currentVariantCount = upload.imageSet.variants?.length ?? 0;
    if (currentVariantCount >= REQUIRED_VARIANT_COUNT) {
      throw new BadRequestError(
        `Upload already has ${REQUIRED_VARIANT_COUNT} variants. Reprocessing is only available for incomplete image sets.`
      );
    }

    const sourcePath = upload.imageSet.sourceImage?.path;
    if (!sourcePath) {
      throw new BadRequestError("Source image is missing for this upload");
    }

    const sourceMetadata = this.imageStorage.extractPathMetadata(sourcePath);
    if (!sourceMetadata) {
      throw new BadRequestError("Could not resolve image storage path for source image");
    }

    const sourceImageBuffer = await this.imageStorage.readImage(sourcePath);
    const regeneratedVariants = await this.generateVariantsFromSourceImage(
      sourceImageBuffer,
      sourceMetadata.timestampDir,
      sourceMetadata.locationName
    );

    const refreshedSourceMeta = await this.extractMetadataFromFile(sourcePath);
    upload.imageSet.sourceImage = {
      path: sourcePath,
      dimensions: {
        width: refreshedSourceMeta.width,
        height: refreshedSourceMeta.height,
      },
      size: refreshedSourceMeta.size,
      format: refreshedSourceMeta.format,
    };
    upload.imageSet.variants = regeneratedVariants;

    const saved = saveUpload(upload);
    if (!saved) {
      throw new Error("Failed to save reprocessed upload variants");
    }

    const updatedUpload = getUploadById(uploadId);
    if (!updatedUpload) {
      throw new NotFoundError("Upload", uploadId);
    }

    this.touchLocationUpdatedAt(updatedUpload.location_id);

    return updatedUpload;
  }

  async replaceUploadVariants(
    uploadId: number,
    sourceFile: File,
    variantFiles: VariantUpload[],
    altText?: string
  ): Promise<Upload> {
    if (!uploadId || Number.isNaN(uploadId)) {
      throw new BadRequestError("Upload ID required");
    }

    const upload = getUploadById(uploadId);
    if (!upload) {
      throw new NotFoundError("Upload", uploadId);
    }

    if (upload.format !== "imageset" || !upload.imageSet) {
      throw new BadRequestError("Only image-set uploads support replacing variants");
    }

    if (!sourceFile) {
      throw new BadRequestError("Source file required");
    }

    if (!variantFiles || variantFiles.length !== REQUIRED_VARIANT_COUNT) {
      throw new BadRequestError(
        `Exactly ${REQUIRED_VARIANT_COUNT} variant files required (${REQUIRED_VARIANT_TYPES.join(", ")})`
      );
    }

    const sourcePath = upload.imageSet.sourceImage?.path;
    if (!sourcePath) {
      throw new BadRequestError("Source image is missing for this upload");
    }

    const sourceMetadata = this.imageStorage.extractPathMetadata(sourcePath);
    if (!sourceMetadata) {
      throw new BadRequestError("Could not resolve image storage path for source image");
    }

    await this.imageStorage.ensureDirectoryExists(sourceMetadata.timestampDir);

    const providedTypes = new Set(variantFiles.map((item) => item.type));
    for (const type of REQUIRED_VARIANT_TYPES) {
      if (!providedTypes.has(type)) {
        throw new BadRequestError(`Missing variant type: ${type}`);
      }
    }

    const sourceFilePath = join(process.cwd(), sourcePath);
    await this.saveFileToPath(sourceFile, sourceFilePath);

    const sourceMeta = await this.extractMetadataFromFile(sourcePath);
    const variants: ImageVariant[] = [];

    const variantsByType = new Map(variantFiles.map((item) => [item.type, item]));

    for (const type of REQUIRED_VARIANT_TYPES) {
      const variantUpload = variantsByType.get(type);
      if (!variantUpload) {
        throw new BadRequestError(`Missing variant type: ${type}`);
      }
      const { file, cropRegion } = variantUpload;

      const spec = VARIANT_SPECS_IMPORT[type];
      const variantFileName = `${sourceMetadata.locationName}_${type}.webp`;
      const variantFilePath = join(sourceMetadata.timestampDir, variantFileName);
      await this.saveFileToPath(file, variantFilePath);

      const relativePath = this.toRelativePath(variantFilePath);
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
        ...(cropRegion ? { cropRegion } : {}),
      });
    }

    upload.imageSet.sourceImage = {
      path: sourcePath,
      dimensions: {
        width: sourceMeta.width,
        height: sourceMeta.height,
      },
      size: sourceMeta.size,
      format: sourceMeta.format,
    };
    upload.imageSet.variants = variants;
    upload.imageSet.altText = altText !== undefined
      ? (altText.trim() || undefined)
      : upload.imageSet.altText;

    const saved = saveUpload(upload);
    if (!saved) {
      throw new Error("Failed to save replaced upload variants");
    }

    const updatedUpload = getUploadById(uploadId);
    if (!updatedUpload) {
      throw new NotFoundError("Upload", uploadId);
    }

    this.touchLocationUpdatedAt(updatedUpload.location_id);

    return updatedUpload;
  }

  /**
   * Get file extension from filename
   */
  private getFileExtension(filename: string): string {
    const parts = filename.split('.');
    return parts[parts.length - 1] || 'jpg';
  }

  private async generateAltTextOptional(
    imageBuffer: Buffer,
    filename: string,
    format?: string
  ): Promise<string> {
    try {
      return await this.altTextApi.generateAltText(imageBuffer, filename, format);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(
        `[AltText][Vertex] Failed to generate source alt text during upload; continuing without alt text`,
        { filename, format, error: errorMessage }
      );
      return "";
    }
  }

  /**
   * Save a File object to a specific path, converting to WebP format
   */
  private async saveFileToPath(file: File, filePath: string): Promise<void> {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const webpBuffer = await sanitizeUploadedImageBuffer(buffer);

    await Bun.write(filePath, webpBuffer);
  }

  private async saveResizedVariantToPath(
    sourceBuffer: Buffer,
    outputPath: string,
    width: number,
    height: number
  ): Promise<void> {
    const { default: sharp } = await import("sharp");
    const webpBuffer = await sharp(sourceBuffer)
      .resize(width, height, { fit: "cover", position: "centre" })
      .webp({ quality: UPLOAD_WEBP_QUALITY })
      .toBuffer();
    await Bun.write(outputPath, webpBuffer);
  }

  private toRelativePath(filePath: string): string {
    return relative(process.cwd(), filePath).replace(/\\/g, "/");
  }

  private async generateVariantsFromSourceImage(
    sourceBuffer: Buffer,
    storagePath: string,
    locationFilePrefix: string
  ): Promise<ImageVariant[]> {
    const variants: ImageVariant[] = [];

    for (const type of REQUIRED_VARIANT_TYPES) {
      const spec = VARIANT_SPECS_IMPORT[type];
      const variantFileName = `${locationFilePrefix}_${type}.webp`;
      const variantFilePath = join(storagePath, variantFileName);

      await this.saveResizedVariantToPath(
        sourceBuffer,
        variantFilePath,
        spec.width,
        spec.height
      );

      const relativePath = this.toRelativePath(variantFilePath);
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
    }

    return variants;
  }

  private touchLocationUpdatedAt(locationId: number): void {
    const updated = updateLocationById(locationId, {
      // Keep this format aligned with sync-state timestamps for stable comparison.
      updated_at: new Date().toISOString().replace("T", " ").replace(/\.\d{3}Z$/, ""),
    });

    if (!updated) {
      console.warn(`Failed to update location.updated_at after upload mutation (location: ${locationId})`);
    }
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
    const locationId = upload.location_id;

    if (upload.format === "imageset" && upload.imageSet) {
      imagePath = upload.imageSet.sourceImage?.path;
    }
    // REMOVED: Legacy uploads no longer store image paths in the database

    if (!imagePath) {
      this.touchLocationUpdatedAt(locationId);
      return; // No files to clean up
    }

    const metadata = this.imageStorage.extractPathMetadata(imagePath);
    if (!metadata) {
      console.warn("Could not extract path metadata", { path: imagePath });
      this.touchLocationUpdatedAt(locationId);
      return;
    }

    // 4. Delete timestamp folder and cleanup empty parents
    try {
      await this.imageStorage.deleteTimestampFolder(metadata.timestampDir);
      await this.imageStorage["cleanupEmptyFolders"](metadata.timestampDir);
    } catch (error) {
      console.error("File deletion failed for upload", { id, error });
    }

    this.touchLocationUpdatedAt(locationId);
  }
}
