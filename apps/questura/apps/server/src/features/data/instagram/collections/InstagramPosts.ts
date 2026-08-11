/**
 * InstagramPosts Collection
 * Stores Instagram embed codes for travel content galleries
 * Can be reused across multiple travel data collections
 */

import { staffUser } from '@/features/auth/lib/staff-user'
import { serviceAccountHasCollectionGrant } from '@/features/auth/lib/service-account-grants'
import { CollectionConfig } from 'payload'

export const InstagramPosts: CollectionConfig = {
  slug: 'instagram-posts',
  labels: {
    singular: 'Instagram Post',
    plural: 'Instagram Posts',
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['previewImage', 'title', 'status', 'createdAt'],
    group: 'Media',
    description: 'Manage Instagram embed codes for travel content',
  },
  access: {
    read: ({ req }) => {
      if (!req.user) return { status: { equals: 'published' } }
      return (
        serviceAccountHasCollectionGrant(req.user, 'instagram-posts', 'read') ||
        Boolean(staffUser(req.user))
      )
    },
    create: ({ req }) => {
      const role = staffUser(req.user)?.role
      return (
        serviceAccountHasCollectionGrant(req.user, 'instagram-posts', 'create') ||
        role === 'editor' ||
        role === 'admin'
      )
    },
    update: ({ req, data }: any) => {
      if (!req.user) return false
      if (staffUser(req.user)?.role === 'admin') return true
      if (staffUser(req.user)?.role === 'editor') return data?.createdBy === req.user.id
      return false
    },
    delete: ({ req }) => staffUser(req.user)?.role === 'admin',
  },
  fields: [
    {
      name: 'previewImage',
      type: 'upload',
      relationTo: 'media-assets',
      required: false,
      admin: {
        description: 'Upload a screenshot or cover image for this post (for admin reference)',
      },
    },
    {
      name: 'title',
      type: 'text',
      required: true,
      admin: {
        description: 'Descriptive title for this Instagram post (for internal reference)',
      },
    },
    {
      name: 'embedCode',
      type: 'textarea',
      required: true,
      admin: {
        description: 'Paste the Instagram embed code here (the entire <blockquote> tag)',
        rows: 8,
      },
    },
    {
      name: 'status',
      type: 'select',
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Published', value: 'published' },
      ],
      defaultValue: 'draft',
      admin: {
        position: 'sidebar',
        description: 'Control visibility of this Instagram post',
      },
    },
  ],
}
