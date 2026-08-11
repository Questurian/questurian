import { staffUser } from '@/features/auth/lib/staff-user'
import type { CollectionConfig } from 'payload'

export const mediaAssetAccess: CollectionConfig['access'] = {
  read: ({ req }) => {
    // Public access required for website to display images
    if (!req.user) return true

    // Admins, Editors, and Writers can see everything
    const role = staffUser(req.user)?.role
    if (role === 'admin' || role === 'editor' || role === 'writer')
      return true

    return false
  },
  create: ({ req }) => {
    // Editors, admins, and writers can upload
    const role = staffUser(req.user)?.role
    return role === 'editor' || role === 'admin' || role === 'writer'
  },
  update: ({ req }) => {
    const user = staffUser(req.user)
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
    const user = staffUser(req.user)
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
