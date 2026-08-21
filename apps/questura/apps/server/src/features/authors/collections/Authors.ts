import type { CollectionConfig, Where } from 'payload'

import { isAdminFieldLevel } from '@/features/auth/collections/access'
import { isDisabledStaff } from '@/features/auth/lib/staff-status'
import { staffUser } from '@/features/auth/lib/staff-user'
import { revalidateAuthorAfterChange } from '@/features/public-revalidation/revalidate-client'
import { authorSlugHook } from './hooks/authorSlug'
import { authorSocialLinks } from './fields/socialLinks'
import { articleByline } from './fields/articleByline'

/**
 * Public authorship, separated from the staff account that happens to hold it
 * (ADR-0007).
 *
 * The `user` relationship is nullable on purpose, and that is the load-bearing
 * part of this collection: an author record with no linked account is a valid,
 * fully renderable state. Published work therefore keeps its byline and its
 * author page whether the person is disabled, deleted, or never had a staff
 * account at all. Do not make it required.
 */
export const Authors: CollectionConfig = {
  slug: 'authors',
  labels: {
    singular: 'Author',
    plural: 'Authors',
  },
  admin: {
    useAsTitle: 'displayName',
    defaultColumns: ['displayName', 'slug', 'user', 'updatedAt'],
    group: 'Core',
    description:
      'Public author identity: the byline and the /authors/<slug> page. Outlives the staff account it is linked to.',
  },
  access: {
    // Public reads go through /api/public/authors/[slug], which overrides
    // access. Direct collection reads stay staff-only, matching Users.
    read: ({ req }) => {
      const user = staffUser(req.user)
      return Boolean(user) && !isDisabledStaff(user)
    },
    create: ({ req, data }) => {
      const user = staffUser(req.user)
      if (!user || isDisabledStaff(user)) return false
      if (user.role === 'admin') return true
      // Staff may bring their own author record into existence -- someone who
      // has not published yet has none, and that must not block them editing
      // how they will appear. Only their own: the linked account is checked
      // here because field access cannot reject a create it never sees.
      return data?.user === user.id
    },
    update: ({ req }) => {
      const user = staffUser(req.user)
      if (!user || isDisabledStaff(user)) return false
      if (user.role === 'admin') return true
      // An editor curates bylines, so they reach a writer's author record as
      // well as their own -- and an orphan record, which is the byline of
      // someone who has left and the one most likely to need a correction
      // with nobody around to make it (ADR-0011). This widens `authors` only:
      // `users` is untouched, so an editor still cannot read, re-role or
      // disable any account but their own, and `slug` stays admin-only via
      // field access below.
      if (user.role === 'editor') {
        const editorScope: Where = {
          or: [
            { user: { equals: user.id } },
            { 'user.role': { equals: 'writer' } },
            { user: { exists: false } },
          ],
        }
        return editorScope
      }
      // Everyone else may edit only the author record linked to their account.
      return { user: { equals: user.id } }
    },
    // Deleting an author record is what actually destroys a byline, so it is
    // narrower than disabling the person: admins only.
    delete: ({ req }) => {
      const user = staffUser(req.user)
      return Boolean(user) && !isDisabledStaff(user) && user?.role === 'admin'
    },
  },
  hooks: {
    beforeChange: [authorSlugHook],
    // Edits here are exactly what the public author page renders
    afterChange: [revalidateAuthorAfterChange],
  },
  fields: [
    {
      name: 'slug',
      type: 'text',
      unique: true,
      index: true,
      access: {
        // Author URLs are public and un-redirected once a slug changes, so
        // only admins may rename one. Hook-set values bypass field access, so
        // auto-generation is unaffected.
        update: isAdminFieldLevel,
      },
      admin: {
        position: 'sidebar',
        description:
          'URL slug for the public author page (/authors/<slug>). Auto-generated from the display name if left empty. Admin-only: changing it breaks inbound author URLs.',
      },
    },
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: false,
      unique: true,
      index: true,
      access: {
        update: isAdminFieldLevel,
      },
      admin: {
        position: 'sidebar',
        description:
          'The staff account that writes as this author, if there still is one. Deliberately optional: an author with no account keeps their page and their bylines.',
      },
    },
    {
      name: 'displayName',
      type: 'text',
      required: true,
      admin: {
        description: 'Name shown to website visitors on bylines and the author page.',
      },
    },
    {
      name: 'avatar',
      type: 'upload',
      relationTo: 'media-assets',
      admin: {
        description: 'Profile picture displayed on the author page.',
      },
    },
    {
      name: 'bio',
      type: 'textarea',
      admin: {
        description: 'Author biography displayed on the author page.',
      },
    },
    {
      name: 'expertise',
      type: 'array',
      admin: {
        description: 'Areas of travel expertise (e.g., "Southeast Asia", "Budget Travel")',
      },
      fields: [
        {
          name: 'area',
          type: 'text',
          required: true,
          admin: {
            description: 'Specific area of travel expertise',
          },
        },
      ],
    },
    authorSocialLinks,
    articleByline,
  ],
}
