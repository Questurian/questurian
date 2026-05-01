import { VARIANT_SEQUENCE, type ImageVariantType } from '../../utils/imageProcessing';
import { postFormData } from '../client/imageApiClient';
import type { UploadImageResponse, UploadProgress } from '../contracts/image-api.contracts';
import { normalizeRequestError, parseErrorMessage } from '../errors/image-api-error.utils';

type UploadVariantsParams = {
  variantFiles: { type: ImageVariantType; file: File }[];
  externalRef: string;
  altText: string;
  locationRef?: number;
  token: string;
  photographerCredit: string;
  onProgress?: (progress: UploadProgress) => void;
  tags?: number[];
};

export function validateVariantFilesForUpload(
  variantFiles: { type: ImageVariantType; file: File }[]
): void {
  const required = new Set<ImageVariantType>(VARIANT_SEQUENCE);
  const counts = new Map<ImageVariantType, number>();

  for (const { type } of variantFiles) {
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }

  const missing = VARIANT_SEQUENCE.filter((type) => !counts.has(type));
  const duplicate = VARIANT_SEQUENCE.filter((type) => (counts.get(type) ?? 0) > 1);
  const invalid = variantFiles
    .map(({ type }) => type)
    .filter((type) => !required.has(type));

  if (
    variantFiles.length !== VARIANT_SEQUENCE.length ||
    missing.length > 0 ||
    duplicate.length > 0 ||
    invalid.length > 0
  ) {
    throw new Error(
      [
        `Exactly ${VARIANT_SEQUENCE.length} crop variants are required before upload.`,
        missing.length ? `Missing: ${missing.join(', ')}.` : '',
        duplicate.length ? `Duplicate: ${duplicate.join(', ')}.` : '',
        invalid.length ? `Invalid: ${invalid.join(', ')}.` : '',
      ].filter(Boolean).join(' ')
    );
  }
}

export async function uploadVariantsApi({
  variantFiles,
  externalRef,
  altText,
  locationRef,
  token,
  photographerCredit,
  onProgress,
  tags,
}: UploadVariantsParams): Promise<UploadImageResponse> {
  onProgress?.({
    status: 'uploading',
    progress: 0,
    message: 'Preparing upload...',
  });

  validateVariantFilesForUpload(variantFiles);

  const formData = new FormData();

  variantFiles.forEach(({ type, file }) => {
    formData.append('variants', file);
    formData.append('variant_types', type);
  });

  formData.append('external_ref', externalRef);
  formData.append('alt_text', altText);
  formData.append('photographer_credit', photographerCredit.trim());
  if (locationRef && locationRef > 0) {
    formData.append('location_ref', String(locationRef));
  }
  if (tags && tags.length > 0) {
    formData.append('tags', JSON.stringify(tags));
  }

  onProgress?.({
    status: 'uploading',
    progress: 30,
    message: `Uploading ${variantFiles.length} variants...`,
  });

  try {
    const response = await postFormData('/images/upload-variants', formData, token);

    onProgress?.({
      status: 'processing',
      progress: 70,
      message: 'Creating media set...',
    });

    if (!response.ok) {
      const message = await parseErrorMessage(response, 'Upload failed');
      throw new Error(message);
    }

    const data: UploadImageResponse = await response.json();
    const uploadedVariantCount = Object.keys(data.variantAssetIds || {}).length;

    if (!data.mediaSetId) {
      throw new Error('Upload succeeded but mediaSetId is missing in response');
    }

    if (uploadedVariantCount < variantFiles.length) {
      throw new Error(
        `Upload incomplete: only ${uploadedVariantCount}/${variantFiles.length} variant IDs returned`
      );
    }

    onProgress?.({
      status: 'success',
      progress: 100,
      message: 'Upload complete!',
    });

    return data;
  } catch (error) {
    throw normalizeRequestError(error, 'Upload failed');
  }
}
