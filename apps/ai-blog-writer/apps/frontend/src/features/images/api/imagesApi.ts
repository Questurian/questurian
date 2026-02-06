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
  console.log('uploadImageVariants called with:', { 
    fileCount: variantFiles.length, 
    externalRef, 
    altText: altText ? 'provided' : 'missing',
    token: token ? 'provided' : 'missing'
  });

  onProgress?.({
    status: 'uploading',
    progress: 0,
    message: 'Preparing upload...'
  });

  const formData = new FormData();
  
  // Add each variant file with its type
  variantFiles.forEach(({ type, file }) => {
    console.log(`Adding variant: ${type}, file: ${file.name}, size: ${file.size}`);
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

  console.log('Sending request to:', `${API_URL}/images/upload-variants`);
  
  try {
    const response = await fetch(`${API_URL}/images/upload-variants`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });

    console.log('Response received:', { status: response.status, ok: response.ok });

    onProgress?.({
      status: 'processing',
      progress: 70,
      message: 'Creating media set...'
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Upload failed:', errorText);
      throw new Error(errorText || `Upload failed: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Upload successful:', data);
    return data;
  } catch (error) {
    console.error('Upload error:', error);
    throw error;
  }

  onProgress?.({
    status: 'success',
    progress: 100,
    message: 'Upload complete!'
  });

  return response.json();
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
    const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(errorData.detail || `Upload failed: ${response.statusText}`);
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
  const formData = new FormData();
  formData.append('file', file);
  formData.append('alt_text', altText);

  const response = await fetch(`${API_URL}/images/process-only`, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(errorData.detail || `Processing failed: ${response.statusText}`);
  }

  return response.json();
}
