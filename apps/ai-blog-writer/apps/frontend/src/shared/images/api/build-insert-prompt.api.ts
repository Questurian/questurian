import { postFormData } from './client/imageApiClient';
import { normalizeRequestError, parseErrorMessage } from './errors/image-api-error.utils';

const BUILD_INSERT_PROMPT_TIMEOUT_MS = 45_000;

export type InsertImage = {
  file: File;
  description: string;
};

type BuildInsertPromptParams = {
  file: File;
  sceneDescription: string;
  inserts: InsertImage[];
  changeRequest: string;
};

export async function buildInsertPromptApi({
  file,
  sceneDescription,
  inserts,
  changeRequest,
}: BuildInsertPromptParams): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BUILD_INSERT_PROMPT_TIMEOUT_MS);

  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('scene_description', sceneDescription);
    formData.append('change_request', changeRequest);

    // Append insert files and their descriptions in matching order.
    inserts.forEach((insert) => {
      formData.append('insert_files', insert.file);
      formData.append('insert_descriptions', insert.description);
    });

    const response = await postFormData('/images/build-insert-prompt', formData, controller.signal);

    if (!response.ok) {
      const message = await parseErrorMessage(response, 'Insert prompt build failed');
      throw new Error(message);
    }

    const data = await response.json();
    return data.edit_prompt;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Insert prompt build timed out');
    }
    throw normalizeRequestError(error, 'Insert prompt build failed');
  } finally {
    clearTimeout(timer);
  }
}
