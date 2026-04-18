import { CollectionConfig } from 'payload'
import {
  getArticleLocationScope,
  isLocationWithinArticleScope,
  syncSharedNeighborhoodsField,
  validateSharedNeighborhoodSelection,
} from '@/shared/location/server/articleLocationScope'
import { syncLocationFields } from '@/shared/location/server/syncLocationFields'
import {
  step1Complete,
  inUpdateMode,
  slug,
  title,
  location,
  locationRef,
  sharedNeighborhoods,
  step1UiWrapper,
  headerSection,
  dayCount,
  itineraryDays,
  whereStaying,
  items,
  seo,
  status,
  author,
  publishedAt,
  articleType,
} from './fields'
import {
  type ComputedItineraryBlock,
  validateListicleItineraryBlockRows,
} from './validateListicleItineraryBlockRows'

const getValue = <T,>(data: Record<string, unknown> | undefined, key: string): T | undefined => {
  return data?.[key] as T | undefined
}

function normalizeDayRowBlocks(
  rawWhere: Record<string, unknown>[],
  rawItems: Record<string, unknown>[],
): { whereStaying: Record<string, unknown>[]; items: Record<string, unknown>[] } {
  const lodgingFromItems = rawItems.filter((b) => String(b.blockType) === 'itinerary-where-staying')
  const stopsOnly = rawItems.filter((b) => String(b.blockType) !== 'itinerary-where-staying')
  const normalizedWhereStaying = [...rawWhere, ...lodgingFromItems]
  return { whereStaying: normalizedWhereStaying, items: stopsOnly }
}

export const ListicleItineraries: CollectionConfig = {
  slug: 'listicle-itineraries',
  labels: {
    singular: 'Listicle Itinerary',
    plural: 'Listicle Itineraries',
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'location', 'status', 'author'],
    group: 'Articles',
  },
  access: {
    read: ({ req }) => {
      if (!req.user) {
        return {
          status: {
            equals: 'published',
          },
        }
      }

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
      return (
        req.user?.role === 'editor' ||
        req.user?.role === 'admin' ||
        req.user?.role === 'writer'
      )
    },
    update: ({ req }) => {
      const user = req.user
      if (!user) return false

      if (user.role === 'admin' || user.role === 'editor') return true

      if (user.role === 'writer') {
        return {
          author: {
            equals: user.id,
          },
        }
      }

      return false
    },
    delete: ({ req }) => req.user?.role === 'admin' || req.user?.role === 'editor',
  },
  fields: [
    step1Complete,
    inUpdateMode,
    slug,

    title,
    location,
    locationRef,
    sharedNeighborhoods,
    step1UiWrapper,

    headerSection,
    dayCount,
    itineraryDays,
    whereStaying,
    items,
    seo,

    status,
    author,
    publishedAt,
    articleType,
  ],
  hooks: {
    beforeChange: [
      async ({ data, req, operation }) => {
        if (operation === 'create' && req.user?.id) {
          data.author = req.user.id
        }

        if (data?.title && !data?.slug) {
          data.slug = data.title
            .toLowerCase()
            .trim()
            .replace(/\s+/g, '-')
            .replace(/[^\w-]/g, '')
        }

        if (data?.status === 'published' && !data?.publishedAt) {
          data.publishedAt = new Date().toISOString()
        }

        data.articleType = 'listicle-itinerary'

        return data
      },
    ],
    beforeValidate: [
      syncLocationFields(),
      syncSharedNeighborhoodsField(),
      async ({ data, originalDoc, operation, req }) => {
        const merged = {
          ...(originalDoc ?? {}),
          ...(data ?? {}),
        } as Record<string, unknown>

        const sharedNeighborhoodValidation = await validateSharedNeighborhoodSelection(req.payload, {
          location: getValue<string>(merged, 'location'),
          sharedNeighborhoods: getValue<unknown>(merged, 'sharedNeighborhoods'),
        })

        if (sharedNeighborhoodValidation !== true) {
          throw new Error(sharedNeighborhoodValidation)
        }

        if (
          (operation === 'create' || operation === 'update')
          && !getValue<boolean>(merged, 'step1_complete')
        ) {
          throw new Error('Please complete setup: title and location.')
        }

        const requiredTitle = typeof getValue<string>(merged, 'title') === 'string'
          ? getValue<string>(merged, 'title')?.trim()
          : ''
        if (!requiredTitle) {
          throw new Error('Title is required.')
        }

        const requiredLocation = getValue<string>(merged, 'location')
        if (!requiredLocation) {
          throw new Error('Location is required.')
        }

        const rawLegacyItems = Array.isArray(getValue<unknown[]>(merged, 'items'))
          ? (getValue<unknown[]>(merged, 'items') as Record<string, unknown>[])
          : []
        const rawLegacyWhereStaying = Array.isArray(getValue<unknown[]>(merged, 'whereStaying'))
          ? (getValue<unknown[]>(merged, 'whereStaying') as Record<string, unknown>[])
          : []

        const rawItineraryDays = Array.isArray(getValue<unknown[]>(merged, 'itineraryDays'))
          ? (getValue<unknown[]>(merged, 'itineraryDays') as Record<string, unknown>[])
          : []

        let normalizedDays: Array<{ whereStaying: Record<string, unknown>[]; items: Record<string, unknown>[] }>

        if (rawItineraryDays.length > 0) {
          normalizedDays = rawItineraryDays.map((dayRow) => {
            const wr = Array.isArray(dayRow.whereStaying)
              ? (dayRow.whereStaying as Record<string, unknown>[])
              : []
            const it = Array.isArray(dayRow.items)
              ? (dayRow.items as Record<string, unknown>[])
              : []
            return normalizeDayRowBlocks(wr, it)
          })
        } else {
          const single = normalizeDayRowBlocks(rawLegacyWhereStaying, rawLegacyItems)
          normalizedDays = [single]
        }

        if (normalizedDays.length < 1) {
          normalizedDays = [{ whereStaying: [], items: [] }]
        }

        if (normalizedDays.length > 7) {
          normalizedDays = normalizedDays.slice(0, 7)
        }

        if (data && (operation === 'create' || operation === 'update')) {
          const existingRows = rawItineraryDays.length > 0 ? rawItineraryDays : []
          data.itineraryDays = normalizedDays.map((day, index) => {
            const existingRow = existingRows[index] as Record<string, unknown> | undefined
            const id = existingRow && typeof existingRow.id === 'string' ? existingRow.id : undefined
            return {
              ...(id ? { id } : {}),
              whereStaying: day.whereStaying,
              items: day.items,
            }
          })
          data.dayCount = normalizedDays.length
          data.whereStaying = normalizedDays[0]?.whereStaying ?? []
          data.items = normalizedDays[0]?.items ?? []
        }

        const sourceItemCache = new Map<string, Record<string, unknown> | null>()
        const instagramPostCache = new Map<string, boolean>()

        const computed: ComputedItineraryBlock[] = []

        for (let dayIndex = 0; dayIndex < normalizedDays.length; dayIndex += 1) {
          const day = normalizedDays[dayIndex]
          const dayPrefix = `Day ${dayIndex + 1} — `

          const computedWhere = await validateListicleItineraryBlockRows({
            req,
            blocks: day.whereStaying,
            section: 'whereStaying',
            labelAt: (i) => `${dayPrefix}Where you're staying (${i + 1})`,
            sourceItemCache,
            instagramPostCache,
          })

          const computedStops = await validateListicleItineraryBlockRows({
            req,
            blocks: day.items,
            section: 'stops',
            labelAt: (i) => `${dayPrefix}Stop ${i + 1}`,
            sourceItemCache,
            instagramPostCache,
          })

          computed.push(...computedWhere, ...computedStops)
        }

        const parentLocation = getValue<string>(merged, 'location')
        if (parentLocation) {
          const locationScope = await getArticleLocationScope(req.payload, {
            location: parentLocation,
            sharedNeighborhoods: getValue<unknown>(merged, 'sharedNeighborhoods'),
          })

          for (const block of computed) {
            if (block.location && !isLocationWithinArticleScope(block.location, locationScope)) {
              throw new Error(
                locationScope.exactNeighborhoods
                  ? `${block.displayLabel} location does not match the selected neighborhoods.`
                  : `${block.displayLabel} location does not match itinerary location (${parentLocation}).`,
              )
            }
          }
        }

        const currentStatus = getValue<string>(merged, 'status')
        if (currentStatus === 'published') {
          for (let dayIndex = 0; dayIndex < normalizedDays.length; dayIndex += 1) {
            if (normalizedDays[dayIndex].items.length < 1) {
              throw new Error(
                `Publishing requires at least one itinerary stop on day ${dayIndex + 1}.`,
              )
            }
          }
        }

        return data
      },
    ],
  },
}
