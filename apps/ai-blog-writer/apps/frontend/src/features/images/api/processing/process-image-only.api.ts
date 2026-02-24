import { postFormData } from '../client/imageApiClient';
import type { ProcessImageOnlyResponse } from '../contracts/image-api.contracts';
import { normalizeRequestError, parseErrorMessage } from '../errors/image-api-error.utils';

type ProcessImageOnlyParams = {
  file: File;
  altText: string;
};

export async function processImageOnlyApi({
  file,
  altText,
}: ProcessImageOnlyParams): Promise<ProcessImageOnlyResponse> {
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('alt_text', altText);

    const response = await postFormData('/images/process-only', formData);

    if (!response.ok) {
      const message = await parseErrorMessage(response, 'Processing failed');
      throw new Error(message);
    }

    return response.json();
  } catch (error) {
    throw normalizeRequestError(error, 'Processing failed');
  }
}
