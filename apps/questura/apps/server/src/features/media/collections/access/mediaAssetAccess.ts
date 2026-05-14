import type { CollectionConfig } from 'payload'

export const mediaAssetAccess: CollectionConfig['access'] = {
  read: ({ req }) => {
    // Public access required for website to display images
    if (!req.user) return true

    // Admins, Editors, and Writers can see everything
    if (req.user.role === 'admin' || req.user.role === 'editor' || req.user.role === 'writer')
      return true

    return false
  },
  create: ({ req }) => {
    // Editors, admins, and writers can upload
    return req.user?.role === 'editor' || req.user?.role === 'admin' || req.user?.role === 'writer'
  },
  update: ({ req }) => {
    const user = req.user
    if (!user) return false

    // Admins and editors can update all
    if (user.role === 'admin' || user.role === 'editor') return true

    // Writers can only update their own uploads
    if (user.role === 'writer') {
      return {
        uploadedBy: {
          equals: user.id,
        },
      }
    }

    return false
  },
  delete: ({ req }) => {
    const user = req.user
    if (!user) return false

    // Admins and editors can delete all
    if (user.role === 'admin' || user.role === 'editor') return true

    // Writers can only delete their own uploads
    if (user.role === 'writer') {
      return {
        uploadedBy: {
          equals: user.id,
        },
      }
    }

    return false
  },
}
