/**
 * API client for image upload and processing
 */

import type { ImageVariantType } from '../utils/imageProcessing';

const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4003';

export interface UploadImageResponse {
  success: boolean;
  mediaSetId: string;
  externalRef: string;
  variantAssetIds?: {
    [key: string]: string;
  };
  variants: {
    [key: string]: {
      filename: string;
      width: number;
      height: number;
      size: number;
    };
  };
}

export interface UploadProgress {
  status: 'idle' | 'uploading' | 'processing' | 'success' | 'error';
  progress: number;
  message: string;
  error?: string;
}

interface StructuredPayloadError {
  step?: string;
  message?: string;
  detail?: string;
  status_code?: number;
  request_url?: string;
  response_body?: string;
}

interface StructuredApiErrorDetail {
  message?: string;
  step?: string;
  detail?: string;
  failed_variant?: string;
  payload_error?: StructuredPayloadError;
}

interface ErrorResponseBody {
  detail?: string | StructuredApiErrorDetail;
  message?: string;
  error?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function formatStructuredError(
  detail: StructuredApiErrorDetail,
  fallback: string
): string {
  const message = normalizeText(detail.message || fallback);
  const step = detail.step || detail.payload_error?.step;
  const reason = normalizeText(detail.detail || detail.payload_error?.detail || '');
  const failedVariant = detail.failed_variant;
  const payloadStatus = detail.payload_error?.status_code;

  const segments = [message];
  if (step) segments.push(`step: ${step}`);
  if (failedVariant) segments.push(`variant: ${failedVariant}`);
  if (reason && reason !== message) segments.push(reason);
  if (payloadStatus) segments.push(`Payload HTTP ${payloadStatus}`);

  return segments.join(' | ');
}

async function parseErrorMessage(
  response: Response,
  fallbackMessage: string
): Promise<string> {
  const bodyText = await response.text().catch(() => '');
  const fallback = `${fallbackMessage} (HTTP ${response.status})`;

  if (!bodyText) {
    return fallback;
  }

  let body: ErrorResponseBody | null = null;
  try {
    body = JSON.parse(bodyText) as ErrorResponseBody;
  } catch {
    body = null;
  }

  if (body) {
    if (typeof body.detail === 'string' && body.detail.trim()) {
      return normalizeText(body.detail);
    }
    if (isRecord(body.detail)) {
      return formatStructuredError(
        body.detail as StructuredApiErrorDetail,
        fallback
      );
    }
    if (typeof body.message === 'string' && body.message.trim()) {
      return normalizeText(body.message);
    }
    if (typeof body.error === 'string' && body.error.trim()) {
      return normalizeText(body.error);
    }
  }

  const cleanText = normalizeText(bodyText);
  if (!cleanText || cleanText.startsWith('<')) {
    return fallback;
  }

  if (cleanText.length > 300) {
    return `${cleanText.slice(0, 300)}...`;
  }

  return cleanText;
}

function normalizeRequestError(
  error: unknown,
  fallbackMessage: string
): Error {
  if (error instanceof TypeError && /fetch/i.test(error.message)) {
    return new Error(
      `Cannot reach image API at ${API_URL}. Check that the backend is running.`
    );
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error(fallbackMessage);
}

/**
 * Upload pre-processed image variants to be stored in Payload CMS
 * This is used after client-side cropping with MultiVariantCropper
 */
export async function uploadImageVariants(
  variantFiles: { type: ImageVariantType; file: File }[],
  externalRef: string,
  altText: string,
  token: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<UploadImageResponse> {
  onProgress?.({
    status: 'uploading',
    progress: 0,
    message: 'Preparing upload...'
  });

  const formData = new FormData();
  
  // Add each variant file with its type
  variantFiles.forEach(({ type, file }) => {
    formData.append(`variants`, file);
    formData.append(`variant_types`, type);
  });
  
  formData.append('external_ref', externalRef);
  formData.append('alt_text', altText);

  onProgress?.({
    status: 'uploading',
    progress: 30,
    message: `Uploading ${variantFiles.length} variants...`
  });

  try {
    const response = await fetch(`${API_URL}/images/upload-variants`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });

    onProgress?.({
      status: 'processing',
      progress: 70,
      message: 'Creating media set...'
    });

    if (!response.ok) {
      const message = await parseErrorMessage(response, 'Upload failed');
      throw new Error(message);
    }

    const data: UploadImageResponse = await response.json();
    const uploadedVariantCount = Object.keys(data.variantAssetIds || {}).length;
    if (!data.mediaSetId) {
      throw new Error('Upload succeeded but mediaSetId is missing in response');
    }
    if (uploadedVariantCount < variantFiles.length) {
      throw new Error(
        `Upload incomplete: only ${uploadedVariantCount}/${variantFiles.length} variant IDs returned`
      );
    }

    onProgress?.({
      status: 'success',
      progress: 100,
      message: 'Upload complete!'
    });

    return data;
  } catch (error) {
    throw normalizeRequestError(error, 'Upload failed');
  }
}

/**
 * Upload a single original image to be processed server-side
 * This is the simpler flow without client-side cropping
 */
export async function uploadImage(
  file: File,
  externalRef: string,
  altText: string,
  token: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<UploadImageResponse> {
  try {
    onProgress?.({
      status: 'uploading',
      progress: 0,
      message: 'Preparing upload...'
    });

    const formData = new FormData();
    formData.append('file', file);
    formData.append('external_ref', externalRef);
    formData.append('alt_text', altText);

    onProgress?.({
      status: 'uploading',
      progress: 30,
      message: 'Uploading to server...'
    });

    const response = await fetch(`${API_URL}/images/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });

    onProgress?.({
      status: 'processing',
      progress: 70,
      message: 'Processing image variants...'
    });

    if (!response.ok) {
      const message = await parseErrorMessage(response, 'Upload failed');
      throw new Error(message);
    }

    onProgress?.({
      status: 'processing',
      progress: 90,
      message: 'Creating media set...'
    });

    const data: UploadImageResponse = await response.json();

    onProgress?.({
      status: 'success',
      progress: 100,
      message: 'Upload complete!'
    });

    return data;
  } catch (error) {
    throw normalizeRequestError(error, 'Upload failed');
  }
}

/**
 * Generate alt text for an image using Gemini vision AI
 */
export async function generateAltText(
  file: File
): Promise<string> {
  try {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_URL}/images/generate-alt-text`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const message = await parseErrorMessage(
        response,
        'Alt text generation failed'
      );
      throw new Error(message);
    }

    const data = await response.json();
    return data.alt_text;
  } catch (error) {
    throw normalizeRequestError(error, 'Alt text generation failed');
  }
}

/**
 * Process an image without uploading to Payload (for testing)
 */
export async function processImageOnly(
  file: File,
  altText: string = ''
): Promise<{
  success: boolean;
  original_filename: string;
  original_size: number;
  variants: {
    [key: string]: {
      filename: string;
      width: number;
      height: number;
      content_type: string;
      size: number;
    };
  };
}> {
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('alt_text', altText);

    const response = await fetch(`${API_URL}/images/process-only`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const message = await parseErrorMessage(response, 'Processing failed');
      throw new Error(message);
    }

    return response.json();
  } catch (error) {
    throw normalizeRequestError(error, 'Processing failed');
  }
}
