export interface PayloadMediaAssetResponse {
  message: string;
  doc: {
    id: string;
    filename: string;
    mimeType: string;
    filesize: number;
    width: number;
    height: number;
    url: string;
    altText?: string;
    location?: string;
    createdAt: string;
    updatedAt: string;
  };
}
