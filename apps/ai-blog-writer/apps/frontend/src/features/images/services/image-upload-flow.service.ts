import { generateAltText, uploadImageVariants, type UploadProgress, type UploadImageResponse } from '../api/imagesApi';
import type { VariantUploadFile } from '../types';

type UploadPreparedVariantsParams = {
  variantFiles: VariantUploadFile[];
  externalRef: string;
  altText: string;
  locationRef: number;
  token: string;
  photographerCredit: string;
  onProgress: (progress: UploadProgress) => void;
};

export async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve((event.target?.result as string) || '');
    reader.onerror = () => reject(new Error('Failed to read file preview'));
    reader.readAsDataURL(file);
  });
}

export async function requestGeneratedAltText(file: File): Promise<string> {
  return generateAltText(file);
}

export async function uploadPreparedVariants({
  variantFiles,
  externalRef,
  altText,
  locationRef,
  token,
  photographerCredit,
  onProgress,
}: UploadPreparedVariantsParams): Promise<UploadImageResponse> {
  return uploadImageVariants(
    variantFiles,
    externalRef,
    altText,
    locationRef,
    token,
    photographerCredit,
    onProgress,
  );
}
