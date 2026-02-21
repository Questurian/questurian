/**
 * SEO Metadata Collection
 *
 * Centralized SEO metadata management for all content collections.
 * Auto-generates defaults from parent content (title, description, gallery).
 */

import { CollectionConfig } from 'payload'

export const SeoMetadata: CollectionConfig = {
  slug: 'seo-metadata',
  labels: {
    singular: 'SEO Metadata',
    plural: 'SEO Metadata',
  },
  admin: {
    useAsTitle: 'metaTitle',
    defaultColumns: ['metaTitle', 'status', 'createdBy'],
    group: 'Tags',
    description: 'SEO metadata for content collections. Auto-populated from parent content if fields are empty.',
  },

  access: {
    read: ({ req }) => {
      if (!req.user) {
        return { status: { equals: 'published' } }
      }
      
      // Admins, Editors, and Writers can read all
      if (
        req.user.role === 'admin' ||
        req.user.role === 'editor' ||
        req.user.role === 'writer'
      )
        return true

      return false
    },
    create: ({ req }) => {
      // Editors, admins, and writers can create
      return (
        req.user?.role === 'editor' ||
        req.user?.role === 'admin' ||
        req.user?.role === 'writer'
      )
    },
    update: ({ req }) => {
      // Admins and editors can update all
      if (req.user?.role === 'admin' || req.user?.role === 'editor') return true

      // Writers can only update their own
      if (req.user?.role === 'writer') {
        return {
          createdBy: {
            equals: req.user.id,
          },
        }
      }

      return false
    },
    delete: ({ req }) => req.user?.role === 'admin',
  },

  fields: [
    // Core SEO Fields
    {
      type: 'collapsible',
      label: 'Basic SEO',
      admin: {
        initCollapsed: false,
      },
      fields: [
        {
          name: 'metaTitle',
          type: 'text',
          maxLength: 70,
          admin: {
            description: 'Page title for search engines (50-60 chars optimal). Auto-generated from content title if empty.',
            placeholder: 'Auto-generated from content title',
          },
          validate: (val: string | null | undefined) => {
            if (val && val.length > 60 && val.length <= 70) {
              return 'Title exceeds recommended 60 characters. Search engines may truncate it.'
            }
            return true
          },
        },
        {
          name: 'metaDescription',
          type: 'textarea',
          maxLength: 170,
          admin: {
            description: 'Description for search results (50-160 chars optimal). Auto-generated from content description if empty.',
            placeholder: 'Auto-generated from content description',
          },
          validate: (val: string | null | undefined) => {
            if (val && val.length > 160 && val.length <= 170) {
              return 'Description exceeds recommended 160 characters. Search engines may truncate it.'
            }
            if (val && val.length < 50) {
              return 'Description is too short. Aim for 50-160 characters for best results.'
            }
            return true
          },
        },
        {
          name: 'keywords',
          type: 'text',
          admin: {
            description: 'Comma-separated keywords for meta keywords tag (optional, mostly ignored by modern search engines)',
            placeholder: 'travel, lima, peru, attractions',
          },
        },
      ],
    },

    // Open Graph Fields
    {
      type: 'collapsible',
      label: 'Social Media (Open Graph)',
      admin: {
        initCollapsed: true,
        description: 'Override how your content appears when shared on social media',
      },
      fields: [
        {
          name: 'ogTitle',
          type: 'text',
          maxLength: 70,
          admin: {
            description: 'Override title for social sharing (Facebook, LinkedIn, etc.). Falls back to metaTitle if empty.',
            placeholder: 'Auto-generated from metaTitle',
          },
        },
        {
          name: 'ogDescription',
          type: 'textarea',
          maxLength: 200,
          admin: {
            description: 'Override description for social sharing. Falls back to metaDescription if empty.',
            placeholder: 'Auto-generated from metaDescription',
          },
        },
        {
          name: 'ogImage',
          type: 'upload',
          relationTo: 'media-assets',
          admin: {
            description: 'Image for social sharing (1200x630px recommended). Auto-selects first gallery image if empty.',
          },
        },
      ],
    },

    // Technical SEO
    {
      type: 'collapsible',
      label: 'Advanced SEO',
      admin: {
        initCollapsed: true,
        description: 'Technical SEO settings for advanced control',
      },
      fields: [
        {
          name: 'canonicalUrl',
          type: 'text',
          admin: {
            description: 'Canonical URL to prevent duplicate content issues. Leave empty to use default URL.',
            placeholder: 'https://questurian.com/attractions/machu-picchu',
          },
        },
        {
          name: 'noIndex',
          type: 'checkbox',
          defaultValue: false,
          admin: {
            description: 'Prevent search engines from indexing this page',
          },
        },
        {
          name: 'noFollow',
          type: 'checkbox',
          defaultValue: false,
          admin: {
            description: 'Prevent search engines from following links on this page',
          },
        },
      ],
    },

    // Tracking Fields (Sidebar)
    {
      name: 'createdBy',
      type: 'relationship',
      relationTo: 'users',
      admin: {
        readOnly: true,
        hidden: true,
        position: 'sidebar',
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
        description: 'Inherits from parent content when auto-generated',
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

        return data
      },
    ],
  },
}
