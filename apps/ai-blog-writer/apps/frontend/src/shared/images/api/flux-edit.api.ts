import { postFormData } from './client/imageApiClient';
import type { FluxEditImageResponse } from './contracts/image-api.contracts';
import { normalizeRequestError, parseErrorMessage } from './errors/image-api-error.utils';

type FluxEditParams = {
  prompt: string;
  referenceImage: File;
  additionalReferenceImages?: File[];
  modelId?: string;
  width?: number;
  height?: number;
  safetyTolerance?: number;
  promptUpsampling?: boolean;
  seed?: string | number;
};

function parseFileNameFromContentDisposition(
  contentDisposition: string | null,
): string | null {
  if (!contentDisposition) return null;
  const match = contentDisposition.match(/filename="([^"]+)"/i);
  if (!match?.[1]) return null;
  return match[1].trim() || null;
}

function parseOptionalNumber(value: string | null): number | null {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function fluxEditApi({
  prompt,
  referenceImage,
  additionalReferenceImages = [],
  modelId,
  width,
  height,
  safetyTolerance,
  promptUpsampling = false,
  seed,
}: FluxEditParams): Promise<FluxEditImageResponse> {
  const normalizedPrompt = prompt.trim();
  if (!normalizedPrompt) {
    throw new Error('Prompt is required.');
  }

  const formData = new FormData();
  formData.append('prompt', normalizedPrompt);
  formData.append('reference_image', referenceImage);
  additionalReferenceImages.forEach((file) => {
    formData.append('additional_reference_images', file);
  });
  if (modelId?.trim()) {
    formData.append('model_id', modelId.trim());
  }
  if (typeof width === 'number' && Number.isFinite(width)) {
    formData.append('width', String(Math.trunc(width)));
  }
  if (typeof height === 'number' && Number.isFinite(height)) {
    formData.append('height', String(Math.trunc(height)));
  }
  if (typeof safetyTolerance === 'number' && Number.isFinite(safetyTolerance)) {
    formData.append('safety_tolerance', String(Math.trunc(safetyTolerance)));
  }
  formData.append('prompt_upsampling', promptUpsampling ? 'true' : 'false');
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    formData.append('seed', String(Math.trunc(seed)));
  } else if (typeof seed === 'string' && seed.trim()) {
    formData.append('seed', seed.trim());
  }

  try {
    const response = await postFormData('/images/flux-edit', formData);

    if (!response.ok) {
      const message = await parseErrorMessage(response, 'Failed to generate image with FLUX.2');
      throw new Error(message);
    }

    const blob = await response.blob();
    if (!blob.size) {
      throw new Error('FLUX.2 returned an empty image.');
    }

    return {
      blob,
      fileName:
        parseFileNameFromContentDisposition(
          response.headers.get('content-disposition'),
        ) || 'flux-2-generated.png',
      contentType: response.headers.get('content-type') || blob.type || 'image/png',
      requestId: response.headers.get('x-bfl-request-id'),
      model: response.headers.get('x-bfl-model'),
      cost: parseOptionalNumber(response.headers.get('x-bfl-cost')),
      inputMegapixels: parseOptionalNumber(response.headers.get('x-bfl-input-mp')),
      outputMegapixels: parseOptionalNumber(response.headers.get('x-bfl-output-mp')),
    };
  } catch (error) {
    throw normalizeRequestError(error, 'Failed to generate image with FLUX.2');
  }
}
