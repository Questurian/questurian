import { postFormData } from './client/imageApiClient';
import { normalizeRequestError, parseErrorMessage } from './errors/image-api-error.utils';

const DESCRIBE_SCENE_TIMEOUT_MS = 30_000;

export async function describeSceneApi(file: File): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DESCRIBE_SCENE_TIMEOUT_MS);

  try {
    const formData = new FormData();
    formData.append('file', file);

    const response = await postFormData('/images/describe-scene', formData, undefined, controller.signal);

    if (!response.ok) {
      const message = await parseErrorMessage(response, 'Scene description failed');
      throw new Error(message);
    }

    const data = await response.json();
    return data.description;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Scene description timed out');
    }
    throw normalizeRequestError(error, 'Scene description failed');
  } finally {
    clearTimeout(timer);
  }
}
