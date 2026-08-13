import { postFormData } from './client/imageApiClient';
import type { UploadSocialImageResponse } from './contracts/image-api.contracts';
import { normalizeRequestError, parseErrorMessage } from './errors/image-api-error.utils';

type UploadSocialImageParams = {
  file: File;
  altText: string;
  photographerCredit: string;
  locationRef: number;
};

export async function uploadSocialImageApi({
  file,
  altText,
  photographerCredit,
  locationRef,
}: UploadSocialImageParams): Promise<UploadSocialImageResponse> {
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('alt_text', altText);
    formData.append('photographer_credit', photographerCredit.trim());
    formData.append('location_ref', String(locationRef));

    const response = await postFormData('/images/upload-social-image', formData);

    if (!response.ok) {
      const message = await parseErrorMessage(response, 'Failed to upload social image');
      throw new Error(message);
    }

    const data: UploadSocialImageResponse = await response.json();
    if (!data.generatedImageUrl?.trim()) {
      throw new Error('Uploaded social image response is missing bunny URL.');
    }

    return data;
  } catch (error) {
    throw normalizeRequestError(error, 'Failed to upload social image');
  }
}
