/**
 * MediaAsset Collection - Bunny.net Integration
 * Uses @seshuk/payload-storage-bunny plugin for CDN storage
 */

import type { CollectionConfig } from 'payload'
import { mediaAssetAccess } from './access'
import { mediaAssetFields } from './fields'
import { mediaAssetHooks } from './hooks'

export const MediaAsset: CollectionConfig = {
  slug: 'media-assets',

  // Disable local storage - use Bunny.net via plugin
  upload: {
    disableLocalStorage: true,
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  },

  access: mediaAssetAccess,

  hooks: mediaAssetHooks,

  // Admin UI customization
  admin: {
    useAsTitle: 'filename',
    defaultColumns: [
      'filename',
      'mediaSet',
      'variant',
      'location',
      'alt_text',
      'width',
      'height',
      'user',
    ],
    group: 'Media',
    hidden: ({ user }) => {
      return !user
    },
  },

  fields: mediaAssetFields,
}
