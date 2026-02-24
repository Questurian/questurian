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

export interface ProcessImageOnlyResponse {
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
}
