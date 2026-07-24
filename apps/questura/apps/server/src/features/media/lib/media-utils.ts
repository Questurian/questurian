/**
 * Media Utility Functions
 * Helper functions for media operations
 * Note: Bunny.net upload handling is managed by @seshuk/payload-storage-bunny plugin
 */

/**
 * Format bytes to human readable format
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes'

  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return Math.round((bytes / Math.pow(k, i)) * Math.pow(10, dm)) / Math.pow(10, dm) + ' ' + sizes[i]
}

/**
 * Check if content type is valid
 */
export function isValidContentType(
  contentType: unknown
): contentType is any {
  const validTypes = ['hotel', 'restaurant', 'article', 'activity', 'user-avatar', 'itinerary', 'affiliate-product']
  return validTypes.includes(contentType as any)
}

/**
 * Check if MIME type is allowed
 */
export function isAllowedMimeType(mimeType: string): boolean {
  const allowed = ['image/jpeg', 'image/png', 'image/webp']
  return allowed.includes(mimeType)
}

/**
 * Check if file size is within limits (5MB)
 */
export function isFileSizeValid(fileSize: number): boolean {
  const maxSizeBytes = 5 * 1024 * 1024
  return fileSize <= maxSizeBytes
}

/**
 * Get human readable file size limit
 */
export function getMaxFileSizeDisplay(): string {
  return formatBytes(5 * 1024 * 1024)
}

/**
 * Check if Bunny.net is enabled
 */
export function isBunnyEnabled(): boolean {
  return !!process.env.BUNNY_STORAGE_API_KEY
}

/**
 * Get cost threshold for alerts
 */
export function getCostThreshold(): number {
  return 30
}
