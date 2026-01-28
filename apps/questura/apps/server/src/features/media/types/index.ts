/**
 * Media Types - Minimal definitions for legacy utilities
 * These are kept for backward compatibility with existing media utilities
 */

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

// Bunny.net Types
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

export class BunnyError extends Error implements BunnyErrorInterface {
  statusCode?: number
  retryable?: boolean

  constructor(message: string, statusCode?: number, retryable?: boolean) {
    super(message)
    this.name = 'BunnyError'
    this.statusCode = statusCode
    this.retryable = retryable
  }
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
