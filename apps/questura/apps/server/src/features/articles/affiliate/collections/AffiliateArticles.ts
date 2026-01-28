/**
 * Affiliate Articles Collection
 * Content management for affiliate product articles with standard headers and product blocks
 */

import { CollectionConfig } from 'payload'
import {
  step1Complete,
  inUpdateMode,
  title,
  step1UiWrapper,
  headerSection,
  items,
  seo,
  slug,
  status,
  author,
  publishedAt,
} from './fields'

export const AffiliateArticles: CollectionConfig = {
  slug: 'affiliate-articles',
  labels: {
    singular: 'Affiliate Article',
    plural: 'Affiliate Articles',
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'status', 'author', 'publishedAt'],
    group: 'Articles',
  },
  access: {
    read: ({ req }) => {
      // Public can only read published articles
      if (!req.user) {
        return {
          status: {
            equals: 'published',
          },
        }
      }
      
      // Admins, Editors, and Writers can read all articles
      if (
        req.user.role === 'admin' ||
        req.user.role === 'editor' ||
        req.user.role === 'writer'
      ) {
        return true
      }

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
    update: ({ req, id }) => {
      const user = req.user
      if (!user) return false

      // Editors and admins can update all articles
      if (user.role === 'admin' || user.role === 'editor') return true

      // Writers can only update their own articles
      if (user.role === 'writer') {
        return {
          author: {
            equals: user.id,
          },
        }
      }

      return false
    },
    delete: ({ req }) => {
      // Editors and admins can delete all articles
      return req.user?.role === 'admin' || req.user?.role === 'editor'
    },
  },
  fields: [
    // Hidden state fields
    step1Complete,
    inUpdateMode,

    // Step 1: Initial Setup
    title,
    step1UiWrapper,

    // Step 2: Content (visible when Step 1 complete)
    headerSection,
    items,
    seo,

    // Sidebar / Meta fields
    slug,
    status,
    author,
    publishedAt,
  ],
  hooks: {
    beforeChange: [
      async ({ data, req, operation }) => {
        // Auto-generate slug from title
        if (data?.title && !data?.slug) {
          data.slug = data.title
            .toLowerCase()
            .trim()
            .replace(/\s+/g, '-')
            .replace(/[^\w-]/g, '')
        }

        // Set author on creation
        if (operation === 'create' && req.user?.id) {
          data.author = req.user.id
        }

        // Set publishedAt when publishing
        if (data?.status === 'published' && !data?.publishedAt) {
          data.publishedAt = new Date().toISOString()
        }

        return data
      },
    ],
    beforeValidate: [
      async ({ data, operation }) => {
        // Only enforce step1_complete on create/update operations (not on initial load)
        if ((operation === 'create' || operation === 'update') && !data?.step1_complete) {
          // Check if we actually have the required fields to "complete" step 1
          if (data?.title) {
             // If we have the data but flag is false, we can technically allow it or auto-set it,
             // but the UI relies on the flag.
             // For safety, if the user tries to save an incomplete article via API without the flag, throw error.
             throw new Error('Please complete the initial setup: title')
          }
        }
        return data
      },
    ],
  },
}

