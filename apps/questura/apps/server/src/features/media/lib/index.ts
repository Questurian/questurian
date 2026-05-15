/**
 * Public API exports for media services
 * Note: Using @seshuk/payload-storage-bunny plugin for Bunny.net integration
 */

export {
  initializeBunnyService,
  formatBytes,
  isValidContentType,
  isAllowedMimeType,
  isFileSizeValid,
  getMaxFileSizeDisplay,
  buildMediaUrl,
  isBunnyEnabled,
  getCostThreshold,
} from './media-utils'

export {
  isMediaSetReadyForPlacement,
  resolveLegacyAssetForPlacement,
  resolveMediaSetForPlacement,
} from './resolve-public-image'
export type { MediaPlacement, PublicImage, PublicImageStatus } from './resolve-public-image'
