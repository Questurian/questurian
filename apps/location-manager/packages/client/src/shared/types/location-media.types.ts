import type { Area } from 'react-easy-crop';
import type { ImageVariantType, VariantCropRegion } from '@questurian/lm-shared';

export interface CropData {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TargetDimensions {
  width: number;
  height: number;
}

export interface CropState {
  variantType: ImageVariantType;
  crop: { x: number; y: number };
  zoom: number;
  croppedAreaPixels: Area | null;
  completed: boolean;
}

export interface ImageVariantUploadFile {
  type: ImageVariantType;
  file: File;
  /** Source-image pixel rect used to produce this variant (from react-easy-crop). */
  cropRegion?: VariantCropRegion;
}

export interface QueuedImageSetPayload {
  sourceFile: File;
  variantFiles: ImageVariantUploadFile[];
  photographerCredit: string;
  altText?: string;
}

export interface QueuedInstagramEmbedPayload {
  embedCode: string;
}

export type QueuedMediaStatus = 'queued' | 'uploading' | 'uploaded' | 'failed';

export interface QueuedImageSetItem extends QueuedImageSetPayload {
  kind: 'image-set';
  queueId: string;
  status: QueuedMediaStatus;
  error?: string;
}

export interface QueuedInstagramEmbedItem extends QueuedInstagramEmbedPayload {
  kind: 'instagram-embed';
  queueId: string;
  status: QueuedMediaStatus;
  error?: string;
}

export type QueuedMediaQueueItem = QueuedImageSetItem | QueuedInstagramEmbedItem;
