import type { CollectionConfig } from 'payload'

export const singleTypeListicleAccess: CollectionConfig['access'] = {
  read: ({ req }) => {
    if (!req.user) {
      return {
        status: {
          equals: 'published',
        },
      }
    }

    if (
      req.user.role === 'admin'
      || req.user.role === 'editor'
      || req.user.role === 'writer'
    ) {
      return true
    }

    return false
  },
  create: ({ req }) => (
    req.user?.role === 'editor'
    || req.user?.role === 'admin'
    || req.user?.role === 'writer'
  ),
  update: ({ req }) => {
    const user = req.user
    if (!user) return false

    if (user.role === 'admin' || user.role === 'editor') return true

    if (user.role === 'writer') {
      return {
        author: {
          equals: user.id,
        },
      }
    }

    return false
  },
  delete: ({ req }) => req.user?.role === 'admin' || req.user?.role === 'editor',
}
