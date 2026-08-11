import type { CollectionConfig } from 'payload'

import { findAuthorIdForUser } from '@/features/authors/lib/author-for-user'

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
  update: async ({ req }) => {
    const user = req.user
    if (!user) return false

    if (user.role === 'admin' || user.role === 'editor') return true

    if (user.role === 'writer') {
      // Bylines point at Authors, so scope on the writer's Author record
      // rather than their account id (ADR-0007). No record means no articles
      // of their own, which is a closed door rather than an open one.
      const authorId = await findAuthorIdForUser(req, user.id)
      if (authorId === null) return false

      return {
        author: {
          equals: authorId,
        },
      }
    }

    return false
  },
  delete: ({ req }) => req.user?.role === 'admin' || req.user?.role === 'editor',
}
