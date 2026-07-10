/**
 * Photo Import flow — types shared by LM client + server.
 * See LM CONTEXT.md "Photo Import flow", "StagedSource", "Rejected Source".
 */

export type StagedSourceStatus = "downloading" | "ready" | "failed";
export type StagedSourceOrigin = "google" | "instagram";
export type InstagramMediaStagingStatus =
  | "pending"
  | "processing"
  | "ready"
  | "partial"
  | "skipped"
  | "failed";

export interface InstagramMediaStagingFields {
  media_staging_status?: InstagramMediaStagingStatus | null;
  media_staging_error?: string | null;
  media_item_count?: number | null;
  staged_item_count?: number | null;
  media_staging_version?: number | null;
}

export interface StagedSourceFields {
  stagedSourceStatus?: StagedSourceStatus | null;
  errorMessage?: string | null;
  googlePhotoName?: string | null;
  sourceKind?: StagedSourceOrigin | null;
  instagramEmbedId?: number | null;
  instagramMediaKey?: string | null;
  sourcePosition?: number | null;
  sourceUrl?: string | null;
}

export interface StagedSourceSnapshot {
  uploadId: number;
  origin: StagedSourceOrigin;
  googlePhotoName: string | null;
  instagramEmbedId: number | null;
  instagramMediaKey: string | null;
  sourcePosition: number | null;
  sourceUrl: string | null;
  stagedSourceStatus: StagedSourceStatus | null;
  errorMessage: string | null;
  hasSource: boolean;
  hasVariants: boolean;
  sourcePath: string | null;
  altText: string | null;
  photographerCredit: string | null;
}

/**
 * Status of a single Google photo, computed per-Location at preview time.
 * - new: returned by Google, never imported or rejected for this Location.
 * - staged: an Upload exists with status=downloading or ready but variants not finalized.
 * - imported: a fully-cropped Upload image-set exists for this photo.
 * - rejected: in the Location's rejected_google_photo_names list.
 */
export type PhotoImportStatus = "new" | "staged" | "imported" | "rejected";

export interface PhotoAuthorAttribution {
  displayName: string;
  uri?: string;
}

export interface PhotoImportPhoto {
  /** Google resource name, e.g. "places/X/photos/Y". Stable across refreshes. */
  name: string;
  widthPx: number | null;
  heightPx: number | null;
  authorAttributions: PhotoAuthorAttribution[];
  status: PhotoImportStatus;
  /** If status='staged' or 'imported', the Upload row this photo maps to. */
  uploadId?: number;
  /** If status='staged' and the StagedSource failed, the error string. */
  errorMessage?: string;
  /**
   * Temporary Google-hosted thumbnail URL for the deselect grid.
   * Short-lived (Google rotates these). Null if status='imported' (use sourcePath instead)
   * or if the URL lookup failed.
   */
  previewUrl?: string | null;
}

export interface PhotoImportPreview {
  locationId: number;
  placeId: string;
  photos: PhotoImportPhoto[];
  /** True if the env key is set; false means clients should hide the import button. */
  configured: boolean;
}

export interface PhotoImportStartPhoto {
  photoName: string;
  photographerCredit?: string | null;
}

export interface PhotoImportStartRequest {
  photos: PhotoImportStartPhoto[];
}

export interface PhotoImportStartResponse {
  startedUploadIds: number[];
  skipped: Array<{ photoName: string; reason: "already-imported" | "already-staged" | "rejected" | "not-in-place" }>;
}

export interface PhotoImportRejectRequest {
  photoName: string;
}
