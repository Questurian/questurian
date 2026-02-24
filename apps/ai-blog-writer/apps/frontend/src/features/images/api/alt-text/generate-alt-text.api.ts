import { postFormData } from '../client/imageApiClient';
import { normalizeRequestError, parseErrorMessage } from '../errors/image-api-error.utils';

type GenerateAltTextParams = {
  file: File;
  narrativeFocus?: string;
};

export async function generateAltTextApi({
  file,
  narrativeFocus,
}: GenerateAltTextParams): Promise<string> {
  try {
    const formData = new FormData();
    formData.append('file', file);

    if (narrativeFocus?.trim()) {
      formData.append('narrative_focus', narrativeFocus.trim());
    }

    const response = await postFormData('/images/generate-alt-text', formData);

    if (!response.ok) {
      const message = await parseErrorMessage(response, 'Alt text generation failed');
      throw new Error(message);
    }

    const data = await response.json();
    return data.alt_text;
  } catch (error) {
    throw normalizeRequestError(error, 'Alt text generation failed');
  }
}
