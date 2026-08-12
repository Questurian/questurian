import { postFormData } from '../client/imageApiClient';
import type { UploadImageResponse, UploadProgress } from '../contracts/image-api.contracts';
import { normalizeRequestError, parseErrorMessage } from '../errors/image-api-error.utils';

type UploadSingleParams = {
  file: File;
  externalRef: string;
  altText: string;
  locationRef: number;
  token: string;
  photographerCredit: string;
  onProgress?: (progress: UploadProgress) => void;
};

export async function uploadSingleApi({
  file,
  externalRef,
  altText,
  locationRef,
  token,
  photographerCredit,
  onProgress,
}: UploadSingleParams): Promise<UploadImageResponse> {
  try {
    onProgress?.({
      status: 'uploading',
      progress: 0,
      message: 'Preparing upload...',
    });

    const formData = new FormData();
    formData.append('file', file);
    formData.append('external_ref', externalRef);
    formData.append('alt_text', altText);
    formData.append('photographer_credit', photographerCredit.trim());
    formData.append('location_ref', String(locationRef));

    onProgress?.({
      status: 'uploading',
      progress: 30,
      message: 'Uploading to server...',
    });

    const response = await postFormData('/images/upload', formData);

    onProgress?.({
      status: 'processing',
      progress: 70,
      message: 'Processing image variants...',
    });

    if (!response.ok) {
      const message = await parseErrorMessage(response, 'Upload failed');
      throw new Error(message);
    }

    onProgress?.({
      status: 'processing',
      progress: 90,
      message: 'Creating media set...',
    });

    const data: UploadImageResponse = await response.json();

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
