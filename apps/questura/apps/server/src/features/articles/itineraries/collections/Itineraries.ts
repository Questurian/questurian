import { CollectionConfig } from 'payload'
import { convertTo24Hour, calculateEndTime } from '../blocks/utils/timeField'
import { syncLocationFields } from '@/shared/location/server/syncLocationFields'
import {
  step1Complete,
  inUpdateMode,
  title,
  location,
  locationRef,
  step1UiWrapper,
  headerSection,
  items,
  seo,
  slug,
  status,
  author,
  publishedAt,
} from './fields'

export const Itineraries: CollectionConfig = {
  slug: 'itineraries',
  labels: {
    singular: 'Itinerary',
    plural: 'Itineraries',
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'location', 'status', 'author'],
    group: 'Articles',
  },
  access: {
    read: ({ req }) => {
      // Public can only read published itineraries
      if (!req.user) {
        return {
          status: {
            equals: 'published',
          },
        }
      }
      
      // Admins, Editors, and Writers can read all
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

      // Editors and admins can update all
      if (user.role === 'admin' || user.role === 'editor') return true

      // Writers can only update their own
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
      // Editors and admins can delete all
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
      syncLocationFields(),
      async ({ data, operation }) => {
        // Only enforce step1_complete on create/update operations (not on initial load)
        if ((operation === 'create' || operation === 'update') && !data?.step1_complete) {
          // Check if we actually have the required fields to "complete" step 1
          if (data?.title && data?.location) {
             // If we have the data but flag is false, we can technically allow it or auto-set it,
             // but the UI relies on the flag.
             // For safety, if the user tries to save an incomplete itinerary via API without the flag, throw error.
             throw new Error('Please complete the initial setup: title and location')
          }
        }
        
        // Verify location matching for relationship items
        if (data?.location && data?.items && Array.isArray(data.items)) {
          const parentLocation = data.location

          for (let i = 0; i < data.items.length; i++) {
            const item = data.items[i]
            if (item?.item && typeof item.item !== 'string') {
              // Item is populated (has location field)
              // Note: Accommodations/Dining/Attractions/Nightlife all have 'location' field
              const itemLocation = item.item.location
              
              if (itemLocation && itemLocation !== parentLocation) {
                console.warn(
                  `[Itineraries beforeValidate] WARNING: Block ${i} has location mismatch!`,
                  `Item location: "${itemLocation}", Parent location: "${parentLocation}"`
                )
              }
            }
          }
        }

        // Validate chronological time ordering using END times
        // This ensures activities don't overlap
        if (data?.items && Array.isArray(data.items)) {
          const timesWithIndices = data.items
            .map((item: any, index: number) => {
              if (!item.timeHour || !item.timeMinute || !item.timePeriod) {
                return null // Skip items without complete time data
              }
              
              const startTime24 = convertTo24Hour(item.timeHour, item.timeMinute, item.timePeriod)
              
              // Calculate end time if duration is provided
              let endTime24 = startTime24
              if (item.durationHours !== undefined || item.durationMinutes !== undefined) {
                const durHours = item.durationHours || 0
                const durMinutes = parseInt(item.durationMinutes || '0', 10)
                endTime24 = calculateEndTime(
                  item.timeHour,
                  item.timeMinute,
                  item.timePeriod,
                  durHours,
                  durMinutes
                )
              }
              
              return { index, startTime24, endTime24, blockType: item.blockType }
            })
            .filter((item): item is NonNullable<typeof item> => item !== null)
          
          // Check if times are in chronological order
          // Compare end time of previous item with start time of current item
          for (let i = 1; i < timesWithIndices.length; i++) {
            const prevEndTime = timesWithIndices[i - 1].endTime24
            const currStartTime = timesWithIndices[i].startTime24
            
            if (currStartTime < prevEndTime) {
              throw new Error(
                `Time conflict: Item ${i + 1} starts at ${currStartTime} but Item ${i} doesn't end until ${prevEndTime}. Please ensure activities don't overlap.`
              )
            }
          }
        }

        return data
      },
    ],
  },
}
