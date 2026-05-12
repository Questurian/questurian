/**
 * Categories Collection
 * Main categories for organizing articles (News, Guides, etc.)
 */

import { CollectionConfig } from 'payload'
import { validateSlugAgainstReserved, RESERVED_SLUGS } from '@/shared/lib/reservedSlugs'
import { validateCategorySlugAgainstLocations } from '@/shared/lib/categoryLocationCollision'

export const Categories: CollectionConfig = {
  slug: 'article-categories',
  labels: {
    singular: 'Article Category',
    plural: 'Article Categories',
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug', 'usageCount', 'status'],
    group: 'Tags',
    description: 'Main categories for organizing articles',
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
        description: 'Category name (e.g., "News", "Crime", "Guides")',
      },
      validate: (value: string | null | undefined) => {
        if (value && value !== value.trim()) {
          return 'Category name should not have leading/trailing spaces'
        }
        return true
      },
    },
    {
      name: 'slug',
      type: 'text',
      unique: true,
      index: true,
      validate: (async (value: unknown, options: { req?: { payload: import('payload').Payload }; id?: number | string }) => {
        if (typeof value !== 'string' || !value) return true
        const reserved = validateSlugAgainstReserved(value)
        if (reserved !== true) return reserved
        return validateCategorySlugAgainstLocations(value, options?.req, options?.id ?? null)
      }) as never,
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'Auto-generated URL-friendly identifier',
      },
    },
    {
      name: 'description',
      type: 'textarea',
      admin: {
        description: 'Optional internal description of category purpose',
        rows: 3,
      },
    },
    {
      name: 'usageCount',
      type: 'number',
      defaultValue: 0,
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'Number of articles in this category (auto-updated)',
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
        description: 'Archive unused categories to hide from selection',
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

        // Auto-generate slug from name
        if (data?.name && (!data?.slug || operation === 'create')) {
          const generated = data.name
            .toLowerCase()
            .trim()
            .replace(/\s+/g, '-')
            .replace(/[^\w-]/g, '')
          if (RESERVED_SLUGS.has(generated)) {
            throw new Error(
              `Category name "${data.name}" produces reserved slug "${generated}". Choose a different name.`,
            )
          }
          data.slug = generated
        }

        return data
      },
    ],
  },
}
