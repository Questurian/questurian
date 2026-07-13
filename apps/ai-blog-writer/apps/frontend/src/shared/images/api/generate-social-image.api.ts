import { postJson } from './client/imageApiClient';
import type { GenerateSocialImageResponse } from './contracts/image-api.contracts';
import { normalizeRequestError, parseErrorMessage } from './errors/image-api-error.utils';

type GenerateSocialImageParams = {
  featuredAssetId?: number;
  featuredMediaSetId?: number;
  token: string;
};

export async function generateSocialImageApi({
  featuredAssetId,
  featuredMediaSetId,
  token,
}: GenerateSocialImageParams): Promise<GenerateSocialImageResponse> {
  try {
    const response = await postJson(
      '/images/generate-social-image',
      { featuredAssetId, featuredMediaSetId },
      token,
    );

    if (!response.ok) {
      const message = await parseErrorMessage(response, 'Failed to generate social image');
      throw new Error(message);
    }

    const data: GenerateSocialImageResponse = await response.json();
    if (!data.generatedImageUrl?.trim()) {
      throw new Error('Generated social image response is missing bunny URL.');
    }

    return data;
  } catch (error) {
    throw normalizeRequestError(error, 'Failed to generate social image');
  }
}
