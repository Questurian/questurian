import type { UploadImageResponse } from './api/imagesApi';
import type { ImageVariantType } from './utils/imageProcessing';

export interface ImageUploadProps {
  externalRef: string;
  fileNamePrefix?: string;
  locationRef: number;
  token: string;
  altText: string;
  photographerCredit?: string;
  onUploadComplete: (result: UploadImageResponse) => void;
  onAltTextGenerated?: (altText: string) => void;
  onPhotographerCreditChange?: (photographerCredit: string) => void;
  onCancel?: () => void;
  className?: string;
}

export type UploadMode = 'select' | 'alttext' | 'crop' | 'uploading';
export type VariantUploadFile = { type: ImageVariantType; file: File };
