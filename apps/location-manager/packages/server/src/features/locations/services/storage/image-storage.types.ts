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
