/**
 * Places Collection
 * Unified POI (Point of Interest) collection for all travel data
 * Replaces separate dining, accommodations, nightlife, and attractions collections
 */

import { CollectionConfig } from 'payload'
import { countryCodes } from '@/shared/constants/countryCodes'
import { createLocationRefField } from '@/shared/location/server/fields'
import { syncLocationFields } from '@/shared/location/server/syncLocationFields'

// Mapping of place category slugs to their detail collection slugs and virtual field names
const categoryToDetailCollection: Record<string, { collection: string; field: string }> = {
  dining: { collection: 'dining-details', field: 'diningType' },
  accommodations: { collection: 'accommodation-details', field: 'accommodationType' },
  nightlife: { collection: 'nightlife-details', field: 'nightlifeType' },
  attractions: { collection: 'attraction-details', field: 'attractionType' },
}

export const Places: CollectionConfig = {
  slug: 'places',
  labels: { singular: 'Place', plural: 'Places' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'categories', 'location', 'status'],
    group: 'Travel Data',
  },
  access: {
    read: ({ req }) => {
      if (!req.user) return { status: { equals: 'published' } }
      return true
    },
    create: ({ req }) => req.user?.role === 'editor' || req.user?.role === 'admin',
    update: ({ req }) => req.user?.role === 'admin' || req.user?.role === 'editor',
    delete: ({ req }) => req.user?.role === 'admin',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      unique: true,
      admin: { description: 'Place name' },
    },
    {
      name: 'categories',
      type: 'relationship',
      relationTo: 'place-categories',
      hasMany: true,
      required: true,
      admin: {
        description: 'Select one or more categories for this place',
        position: 'sidebar',
      },
    },
    // Virtual fields for category-specific types (not stored in places table)
    {
      name: 'diningType',
      type: 'text',
      admin: { hidden: true },
      hooks: {
        beforeChange: [({ siblingData }) => {
          delete siblingData.diningType
        }],
      },
    },
    {
      name: 'accommodationType',
      type: 'text',
      admin: { hidden: true },
      hooks: {
        beforeChange: [({ siblingData }) => {
          delete siblingData.accommodationType
        }],
      },
    },
    {
      name: 'nightlifeType',
      type: 'text',
      admin: { hidden: true },
      hooks: {
        beforeChange: [({ siblingData }) => {
          delete siblingData.nightlifeType
        }],
      },
    },
    {
      name: 'attractionType',
      type: 'text',
      admin: { hidden: true },
      hooks: {
        beforeChange: [({ siblingData }) => {
          delete siblingData.attractionType
        }],
      },
    },
    // UI component that shows type selectors based on selected categories
    {
      name: 'categoryDetails',
      type: 'ui',
      admin: {
        position: 'sidebar',
        components: {
          Field: 'src/features/places/components/PlaceDetailsField.tsx',
        },
      },
    },
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Details',
          fields: [
            {
              name: 'gallery',
              type: 'array',
              minRows: 0,
              maxRows: 20,
              admin: {
                description: 'Image gallery for this place (first image is featured)',
              },
              fields: [
                {
                  name: 'image',
                  type: 'relationship',
                  relationTo: 'media-sets',
                  required: true,
                  admin: { description: 'Gallery media set' },
                },
                {
                  name: 'preview',
                  type: 'ui',
                  admin: {
                    components: {
                      Field: 'src/features/media/components/MediaSetPreview.tsx',
                    },
                  },
                },
              ],
            },
            {
              name: 'instagramGallery',
              type: 'array',
              label: 'Instagram Gallery',
              minRows: 0,
              maxRows: 20,
              admin: {
                description: 'Instagram posts gallery for this place',
              },
              fields: [
                {
                  name: 'post',
                  type: 'relationship',
                  relationTo: 'instagram-posts',
                  required: false,
                  admin: {
                    allowCreate: true,
                    description: 'Select or create an Instagram post',
                  },
                },
                {
                  name: 'preview',
                  type: 'ui',
                  admin: {
                    components: {
                      Field: 'src/features/data/instagram/components/InstagramPostPreview.tsx',
                    },
                  },
                },
              ],
            },
          ],
        },
        {
          label: 'Location',
          fields: [
            {
              name: 'location',
              type: 'text',
              admin: {
                description: 'Select the location',
                components: {
                  Field: 'src/shared/location/LocationPickerField.tsx',
                },
              },
            },
            createLocationRefField(),
            {
              type: 'collapsible',
              label: 'Contact Information',
              admin: {
                initCollapsed: false,
              },
              fields: [
                {
                  name: 'address',
                  type: 'text',
                  admin: {
                    description: 'Google Maps URL',
                  },
                },
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'countryCode',
                      type: 'select',
                      options: countryCodes,
                      admin: {
                        width: '30%',
                        description: 'Country Code',
                      },
                    },
                    {
                      name: 'phoneNumber',
                      type: 'text',
                      admin: {
                        description: 'Contact phone number',
                        width: '70%',
                      },
                    },
                  ],
                },
                {
                  name: 'website',
                  type: 'text',
                  admin: {
                    description: 'Website URL',
                  },
                },
              ],
            },
            {
              type: 'collapsible',
              label: 'Coordinates',
              admin: {
                initCollapsed: false,
              },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'latitude',
                      type: 'number',
                      admin: {
                        width: '50%',
                      },
                    },
                    {
                      name: 'longitude',
                      type: 'number',
                      admin: {
                        width: '50%',
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
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
      admin: { position: 'sidebar' },
    },
  ],
  hooks: {
    beforeValidate: [syncLocationFields()],
    beforeChange: [
      async ({ data, req, operation, context }) => {
        if (operation === 'create' && req.user) {
          data.createdBy = req.user.id
        }
        // Capture virtual field values before they're deleted
        context.detailTypes = {
          diningType: data.diningType,
          accommodationType: data.accommodationType,
          nightlifeType: data.nightlifeType,
          attractionType: data.attractionType,
        }
        return data
      },
    ],
    afterChange: [
      // Sync detail records when place is updated (not on create due to FK timing)
      async ({ doc, previousDoc, req, operation, context }) => {
        // Skip on create - place record may not be committed yet
        // Detail records will be created when user edits the place
        if (operation === 'create') return doc

        const detailTypes = context.detailTypes as Record<string, string | undefined> | undefined

        // Get current category IDs
        const currentCategoryIds = (doc.categories || []).map((cat: any) =>
          typeof cat === 'object' ? cat.id : cat
        )

        // Fetch current categories to get their slugs
        let currentCategories: any[] = []
        if (currentCategoryIds.length > 0) {
          const categoriesResult = await req.payload.find({
            collection: 'place-categories',
            where: { id: { in: currentCategoryIds } },
            depth: 0,
          })
          currentCategories = categoriesResult.docs
        }

        // Create/update detail records for each selected category
        for (const category of currentCategories) {
          const config = categoryToDetailCollection[category.slug]
          if (!config) continue

          const typeValue = detailTypes?.[config.field]

          // Check if detail record exists
          const existing = await req.payload.find({
            collection: config.collection as any,
            where: { place: { equals: doc.id } },
            depth: 0,
          })

          if (existing.docs.length > 0) {
            // Update existing record
            if (typeValue !== undefined) {
              await req.payload.update({
                collection: config.collection as any,
                id: existing.docs[0].id,
                data: { type: typeValue || null },
              })
            }
          } else if (typeValue) {
            // Create new record only if type is selected
            await req.payload.create({
              collection: config.collection as any,
              data: {
                place: doc.id,
                type: typeValue,
              },
            })
          }
        }

        // Orphan handling: delete detail records for removed categories
        if (previousDoc) {
          const previousCategoryIds = (previousDoc.categories || []).map((cat: any) =>
            typeof cat === 'object' ? cat.id : cat
          )

          const removedCategoryIds = previousCategoryIds.filter(
            (id: number) => !currentCategoryIds.includes(id)
          )

          if (removedCategoryIds.length > 0) {
            const removedCategories = await req.payload.find({
              collection: 'place-categories',
              where: { id: { in: removedCategoryIds } },
              depth: 0,
            })

            for (const category of removedCategories.docs) {
              const config = categoryToDetailCollection[category.slug]
              if (config) {
                try {
                  await req.payload.delete({
                    collection: config.collection as any,
                    where: { place: { equals: doc.id } },
                  })
                } catch (error) {
                  // Detail record may not exist, which is fine
                }
              }
            }
          }
        }

        return doc
      },
    ],
  },
}
