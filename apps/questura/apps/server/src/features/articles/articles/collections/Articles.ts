/**
 * Articles Collection
 * Content management for blog articles with standard headers and flexible content blocks
 */

import { CollectionConfig } from 'payload'
import {
  syncSharedNeighborhoodsField,
  validateSharedNeighborhoodSelection,
} from '@/shared/location/server/articleLocationScope'
import { syncLocationFields } from '@/shared/location/server/syncLocationFields'
import { languageField } from '@/shared/i18n/languageField'
import { revalidateArticleCollection } from '@/features/public-revalidation/revalidate-client'
import { handleCanonicalPathChange } from '../lib/handleCanonicalPathChange'
import {
  step1Complete,
  inUpdateMode,
  title,
  location,
  locationRef,
  sharedNeighborhoods,
  step1UiWrapper,
  headerSection,
  contentBlocks,
  seo,
  slug,
  status,
  author,
  publishedAt,
  canonicalPath,
  category,
  tags,
} from './fields'

const articleRevalidation = revalidateArticleCollection('articles')

export const Articles: CollectionConfig = {
  slug: 'articles',
  labels: {
    singular: 'Standard Article',
    plural: 'Standard Articles',
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
          and: [
            {
              author: {
                equals: user.id,
              },
            },
            {
              status: {
                equals: 'draft',
              },
            },
          ],
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
    location,
    locationRef,
    slug,
    sharedNeighborhoods,
    step1UiWrapper,

    // Step 2: Content (visible when Step 1 complete)
    headerSection,
    contentBlocks,
    seo,

    // Sidebar / Meta fields
    status,
    languageField,
    author,
    publishedAt,
    canonicalPath,
    category,
    tags,
  ],
  hooks: {
    beforeChange: [
      async ({ data, req, operation, originalDoc }) => {
        // Set author on creation
        if (operation === 'create' && req.user?.id) {
          data.author = req.user.id
        }

        // Set publishedAt when publishing
        if (data?.status === 'published' && !data?.publishedAt) {
          data.publishedAt = new Date().toISOString()
        }

        await handleCanonicalPathChange({
          data: data as Record<string, unknown>,
          originalDoc: originalDoc as Record<string, unknown> | undefined,
          req,
        })

        return data
      },
    ],
    beforeValidate: [
      syncLocationFields(),
      syncSharedNeighborhoodsField(),
      async ({ data, operation, req }) => {
        const sharedNeighborhoodValidation = await validateSharedNeighborhoodSelection(
          req.payload,
          {
            location: data?.location,
            sharedNeighborhoods: data?.sharedNeighborhoods,
          },
        )

        if (sharedNeighborhoodValidation !== true) {
          throw new Error(sharedNeighborhoodValidation)
        }

        // Only enforce step1_complete on create/update operations (not on initial load)
        // Also ensure we don't block initial creation if fields are present
        if ((operation === 'create' || operation === 'update') && !data?.step1_complete) {
          // Check if we actually have the required fields to "complete" step 1
          if (data?.title && data?.location) {
             // If we have the data but flag is false, we can technically allow it or auto-set it,
             // but the UI relies on the flag.
             // For safety, if the user tries to save an incomplete article via API without the flag, throw error.
             throw new Error('Please complete the initial setup: title and location')
          }
        }

        // Category is required for every published article whose location is
        // at least country-scope. Neighborhood (3-segment) URLs are flattened
        // to city scope by buildCanonicalPath, so they also need a category.
        if (
          (operation === 'create' || operation === 'update') &&
          data?.status === 'published' &&
          typeof data?.location === 'string'
        ) {
          const parts = data.location.split('|').filter(Boolean)
          if (parts.length >= 1 && !data?.category) {
            throw new Error(
              'Published articles must have a category — it determines the public URL.',
            )
          }
        }

        if ((operation === 'create' || operation === 'update') && data?.status === 'published') {
          const slug = typeof data?.slug === 'string' ? data.slug.trim() : ''
          if (!slug) {
            throw new Error('Published articles must have a slug.')
          }

          const seoSection = data?.seoSection as Record<string, unknown> | null | undefined
          const metaDesc =
            typeof seoSection?.metaDescription === 'string'
              ? (seoSection.metaDescription as string).trim()
              : ''
          if (!metaDesc) {
            throw new Error(
              'Published articles must have a meta description (SEO & Metadata tab).',
            )
          }
          if (metaDesc.length < 50) {
            throw new Error(
              `Meta description is ${metaDesc.length} characters — at least 50 required for indexing.`,
            )
          }
        }

        return data
      },
    ],
    afterChange: [articleRevalidation.afterChange],
    afterDelete: [articleRevalidation.afterDelete],
  },
}
