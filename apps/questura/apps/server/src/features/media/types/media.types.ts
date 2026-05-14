export type ContentType =
  | 'hotel'
  | 'restaurant'
  | 'article'
  | 'activity'
  | 'user-avatar'
  | 'itinerary'
  | 'affiliate-product'

export type VariantSize = 'large' | 'vertical' | 'medium' | 'small' | 'thumbnail'

export interface MediaMetadata {
  uploadedAt?: string
  uploadedBy?: string
  uploadSize?: number
  uploadTime?: number
  processingTime?: number
}

export interface BunnyUploadResponse {
  success: boolean
  statusCode: number
}

export interface BunnyFileInfo {
  name: string
  size: number
  path: string
  lastModified: number
  isDirectory: boolean
}

export interface BunnyErrorInterface {
  message: string
  statusCode?: number
}

export interface BunnyRetryConfig {
  maxAttempts: number
  initialDelayMs: number
  backoffMultiplier: number
}

export interface BunnyServiceConfig {
  apiKey: string
  storageZoneName: string
  cdnUrl: string
  retryConfig?: BunnyRetryConfig
}
