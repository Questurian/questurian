import { postFormData } from './client/imageApiClient';
import { normalizeRequestError, parseErrorMessage } from './errors/image-api-error.utils';

const BUILD_EDIT_PROMPT_TIMEOUT_MS = 30_000;

type BuildEditPromptParams = {
  file: File;
  sceneDescription: string;
  changeRequest: string;
};

export async function buildEditPromptApi({
  file,
  sceneDescription,
  changeRequest,
}: BuildEditPromptParams): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BUILD_EDIT_PROMPT_TIMEOUT_MS);

  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('scene_description', sceneDescription);
    formData.append('change_request', changeRequest);

    const response = await postFormData('/images/build-edit-prompt', formData, undefined, controller.signal);

    if (!response.ok) {
      const message = await parseErrorMessage(response, 'Edit prompt build failed');
      throw new Error(message);
    }

    const data = await response.json();
    return data.edit_prompt;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Edit prompt build timed out');
    }
    throw normalizeRequestError(error, 'Edit prompt build failed');
  } finally {
    clearTimeout(timer);
  }
}
