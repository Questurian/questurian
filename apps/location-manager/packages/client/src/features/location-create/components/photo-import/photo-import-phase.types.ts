import type { ImageVariantUploadFile } from "@client/shared/types/location-media.types";

export interface CroppedPhotoSource {
  sourceName: string;
  sourceFile: File;
  variants: ImageVariantUploadFile[];
  photographerCredit: string;
}

export interface PhotoImportSessionState {
  sessionId: string;
  /** Sources the operator chose to import this session. */
  selected: string[];
  /** Sources that have all 7 variants cropped and ready to submit. */
  cropped: CroppedPhotoSource[];
  /** True when selected.length > 0 AND every selected source has been cropped. */
  ready: boolean;
}

export interface PhotoImportPhaseProps {
  /** Required for the pre-Create flow — Location row does not exist yet. */
  placeId: string | null | undefined;
  /** Stable category tag for IDB session metadata. */
  category: string;
  /** Fires on every state change. Parent owns the Create button. */
  onSessionChange: (session: PhotoImportSessionState) => void;
  /** Called when operator explicitly wants to skip the photo import. */
  onSkip?: () => void;
}

export type SourceUiStatus = "idle" | "fetching" | "cropped" | "failed";

export interface SourceCard {
  name: string;
  previewUrl: string | null;
  authorDisplayName: string | null;
  uiStatus: SourceUiStatus;
  errorMessage: string | null;
  cropped: CroppedPhotoSource | null;
}
