/**
 * Articles Collection
 * Content management for blog articles with standard headers and flexible content blocks
 */

import { staffUser } from '@/features/auth/lib/staff-user'
import { CollectionConfig } from 'payload'
import {
  syncSharedNeighborhoodsField,
  validateSharedNeighborhoodSelection,
} from '@/shared/location/server/articleLocationScope'
import { syncLocationFields } from '@/shared/location/server/syncLocationFields'
import { languageField } from '@/shared/i18n/languageField'
import { revalidateArticleCollection } from '@/features/public-revalidation/revalidate-client'
import {
  assertCanDeleteHomepageFeaturedContent,
  assertCanUnpublishHomepageFeaturedContent,
} from '../../shared/lib/referenceLocks'
import { handleCanonicalPathChange } from '../lib/handleCanonicalPathChange'
import { ensureAuthorIdForUser, findAuthorIdForUser } from '@/features/authors/lib/author-for-user'
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
  sourceFeature,
  sourceRunId,
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
        staffUser(req.user)?.role === 'admin' ||
        staffUser(req.user)?.role === 'editor' ||
        staffUser(req.user)?.role === 'writer'
      ) {
        return true
      }

      return false
    },
    create: ({ req }) => {
      // Editors, admins, and writers can create
      return (
        staffUser(req.user)?.role === 'editor' ||
        staffUser(req.user)?.role === 'admin' ||
        staffUser(req.user)?.role === 'writer'
      )
    },
    update: async ({ req, id }) => {
      const user = staffUser(req.user)
      if (!user) return false

      // Editors and admins can update all articles
      if (user.role === 'admin' || user.role === 'editor') return true

      // Writers can only update their own articles. Bylines point at Authors,
      // so scope on the writer's Author record rather than their account id
      // (ADR-0007). No record means no articles of their own.
      if (user.role === 'writer') {
        const authorId = await findAuthorIdForUser(req, user.id)
        if (authorId === null) return false

        return {
          and: [
            {
              author: {
                equals: authorId,
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
      const role = staffUser(req.user)?.role
      return role === 'admin' || role === 'editor'
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
    sourceFeature,
    sourceRunId,
    category,
    tags,
  ],
  hooks: {
    beforeChange: [
      async ({ data, req, originalDoc }) => {
        if (
          originalDoc?.status === 'published' &&
          data?.status &&
          data.status !== 'published' &&
          originalDoc?.id
        ) {
          await assertCanUnpublishHomepageFeaturedContent(req.payload, 'articles', originalDoc.id)
        }

        return data
      },
      async ({ data, req, operation, originalDoc }) => {
        // Set author on creation. The byline is an Author record, not the
        // account that typed it (ADR-0007).
        if (operation === 'create' && req.user?.id) {
          data.author = await ensureAuthorIdForUser(req, req.user.id)
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
    beforeDelete: [
      async ({ req, id }) => {
        await assertCanDeleteHomepageFeaturedContent(req.payload, 'articles', id)
      },
    ],
    afterChange: [articleRevalidation.afterChange],
    afterDelete: [articleRevalidation.afterDelete],
  },
}
