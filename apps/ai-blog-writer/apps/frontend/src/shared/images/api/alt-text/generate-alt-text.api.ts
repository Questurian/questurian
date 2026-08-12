import { postFormData } from '../client/imageApiClient';
import { normalizeRequestError, parseErrorMessage } from '../errors/image-api-error.utils';

type GenerateAltTextParams = {
  file: File;
  narrativeFocus?: string;
};

const ALT_TEXT_TIMEOUT_MS = 15_000

export async function generateAltTextApi({
  file,
  narrativeFocus,
}: GenerateAltTextParams): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ALT_TEXT_TIMEOUT_MS)

  try {
    const formData = new FormData();
    formData.append('file', file);

    if (narrativeFocus?.trim()) {
      formData.append('narrative_focus', narrativeFocus.trim());
    }

    const response = await postFormData('/images/generate-alt-text', formData, controller.signal);

    if (!response.ok) {
      const message = await parseErrorMessage(response, 'Alt text generation failed');
      throw new Error(message);
    }

    const data = await response.json();
    return data.alt_text;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Alt text generation timed out')
    }
    throw normalizeRequestError(error, 'Alt text generation failed');
  } finally {
    clearTimeout(timer)
  }
}
