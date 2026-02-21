/**
 * Tags Collection
 * Tags for detailed article classification (travel themes, topics, etc.)
 */

import { CollectionConfig } from 'payload'

export const Tags: CollectionConfig = {
  slug: 'article-tags',
  labels: {
    singular: 'Article Tag',
    plural: 'Article Tags',
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug', 'usageCount', 'status'],
    group: 'Tags',
    description: 'Tags for detailed article classification (travel themes, topics, etc.)',
  },
  access: {
    read: () => true, // Public read access
    create: ({ req }) => req.user?.role === 'editor' || req.user?.role === 'admin',
    update: ({ req }) => req.user?.role === 'admin' || req.user?.role === 'editor',
    delete: ({ req }) => req.user?.role === 'admin',
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      unique: true,
      admin: {
        description: 'Tag name (e.g., "solo-travel", "family-friendly")',
      },
      validate: (value: string | null | undefined) => {
        if (value && value !== value.trim()) {
          return 'Tag name should not have leading/trailing spaces'
        }
        // Enforce kebab-case for consistency
        if (value && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(value)) {
          return 'Tag should be lowercase with hyphens (e.g., "solo-travel")'
        }
        return true
      },
    },
    {
      name: 'slug',
      type: 'text',
      unique: true,
      index: true,
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'Auto-generated (same as name for tags)',
      },
    },
    {
      name: 'displayName',
      type: 'text',
      admin: {
        description: 'Optional display name (e.g., "Solo Travel" for "solo-travel")',
      },
    },
    {
      name: 'description',
      type: 'textarea',
      admin: {
        description: 'Optional description of when to use this tag',
        rows: 2,
      },
    },
    {
      name: 'usageCount',
      type: 'number',
      defaultValue: 0,
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'Number of articles using this tag (auto-updated)',
      },
    },
    {
      name: 'status',
      type: 'select',
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Archived', value: 'archived' },
      ],
      defaultValue: 'active',
      admin: {
        position: 'sidebar',
        description: 'Archive unused tags to hide from selection',
      },
    },
    {
      name: 'createdBy',
      type: 'relationship',
      relationTo: 'users',
      admin: {
        readOnly: true,
        hidden: true,
      },
    },
  ],
  hooks: {
    beforeChange: [
      async ({ data, req, operation }) => {
        // Set createdBy on creation
        if (operation === 'create' && req.user) {
          data.createdBy = req.user.id
        }

        // Auto-generate slug from name (tags use name as slug since they're already kebab-case)
        if (data?.name) {
          data.slug = data.name
            .toLowerCase()
            .trim()
            .replace(/\s+/g, '-')
            .replace(/[^\w-]/g, '')
        }

        return data
      },
    ],
  },
}
