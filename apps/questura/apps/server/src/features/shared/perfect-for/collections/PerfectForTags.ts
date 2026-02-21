/**
 * PerfectForTags Collection
 * Reusable tags for categorizing venues/attractions by use case
 * Can be applied across dining, attractions, nightlife, and accommodations
 */

import { CollectionConfig } from 'payload'

export const PerfectForTags: CollectionConfig = {
  slug: 'perfect-for-tags',
  labels: {
    singular: 'Perfect For Tag',
    plural: 'Perfect For Tags',
  },
  admin: {
    useAsTitle: 'label',
    defaultColumns: ['label', 'category', 'applicableTypes', 'status'],
    group: 'Tags',
    description: 'Tags for categorizing venues by use case (e.g., "First Date", "Big Groups")',
  },
  access: {
    read: () => true, // Public read access
    create: ({ req }) => req.user?.role === 'editor' || req.user?.role === 'admin',
    update: ({ req }) => req.user?.role === 'admin' || req.user?.role === 'editor',
    delete: ({ req }) => req.user?.role === 'admin',
  },
  fields: [
    {
      name: 'label',
      type: 'text',
      required: true,
      unique: true,
      admin: {
        description: 'Tag display name (e.g., "First Date", "Big Groups")',
      },
      validate: (value: string | null | undefined) => {
        // Enforce consistent capitalization and no extra spaces
        if (value && value !== value.trim()) {
          return 'Label should not have leading/trailing spaces'
        }
        return true
      },
    },
    {
      name: 'slug',
      type: 'text',
      unique: true,
      admin: {
        readOnly: true,
        description: 'Auto-generated URL-friendly identifier',
      },
    },
    {
      name: 'category',
      type: 'select',
      required: true,
      options: [
        { label: 'Group Size', value: 'group-size' },
        { label: 'Occasion', value: 'occasion' },
        { label: 'Vibe', value: 'vibe' },
        { label: 'Time of Day', value: 'time-of-day' },
        { label: 'Dietary', value: 'dietary' },
        { label: 'Activity Level', value: 'activity-level' },
        { label: 'Budget', value: 'budget' },
        { label: 'Special Features', value: 'special-features' },
      ],
      admin: {
        description: 'Organizing category for this tag',
      },
    },
    {
      name: 'applicableTypes',
      type: 'select',
      hasMany: true,
      required: true,
      options: [
        { label: 'Dining', value: 'dining' },
        { label: 'Attractions', value: 'attractions' },
        { label: 'Nightlife', value: 'nightlife' },
        { label: 'Accommodations', value: 'accommodations' },
      ],
      admin: {
        description: 'Which collection types can use this tag',
      },
    },
    {
      name: 'description',
      type: 'textarea',
      admin: {
        description: 'Optional internal description of what this tag means',
        rows: 2,
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
        description: 'Archive unused tags to hide them from selection',
      },
    },
    {
      name: 'usageCount',
      type: 'number',
      defaultValue: 0,
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'Number of venues using this tag (auto-updated)',
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

        // Auto-generate slug from label
        if (data?.label && (!data?.slug || operation === 'create')) {
          data.slug = data.label
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
