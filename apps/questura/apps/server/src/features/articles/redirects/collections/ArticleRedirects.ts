import { staffUser } from '@/features/auth/lib/staff-user'
import type { CollectionConfig } from 'payload'
import {
  revalidateArticleRedirectAfterChange,
  revalidateArticleRedirectAfterDelete,
} from '@/features/public-revalidation/revalidate-client'

export const ArticleRedirects: CollectionConfig = {
  slug: 'article-redirects',
  labels: {
    singular: 'Article Redirect',
    plural: 'Article Redirects',
  },
  admin: {
    useAsTitle: 'oldPath',
    defaultColumns: ['oldPath', 'newPath', 'statusCode', 'updatedAt'],
    group: 'Articles',
    description:
      'Permanent redirects auto-generated when a published article changes its country, city, category, or slug.',
  },
  access: {
    read: () => true,
    create: ({ req }) => {
      const role = staffUser(req.user)?.role
      return role === 'admin' || role === 'editor'
    },
    update: ({ req }) => {
      const role = staffUser(req.user)?.role
      return role === 'admin' || role === 'editor'
    },
    delete: ({ req }) => staffUser(req.user)?.role === 'admin',
  },
  fields: [
    {
      name: 'oldPath',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
    {
      name: 'newPath',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'article',
      type: 'relationship',
      relationTo: 'articles',
      hasMany: false,
    },
    {
      name: 'statusCode',
      type: 'select',
      options: [
        { label: '301 (Moved Permanently)', value: '301' },
        { label: '308 (Permanent Redirect)', value: '308' },
      ],
      defaultValue: '301',
      required: true,
    },
    {
      name: 'source',
      type: 'text',
      defaultValue: 'article-url-change',
      admin: {
        readOnly: true,
      },
    },
  ],
  hooks: {
    afterChange: [revalidateArticleRedirectAfterChange],
    afterDelete: [revalidateArticleRedirectAfterDelete],
  },
}
