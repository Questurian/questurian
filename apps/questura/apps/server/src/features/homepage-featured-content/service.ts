import type { Payload } from 'payload'

import { APP_CONFIG } from '@/shared/config'

import {
  HOMEPAGE_FEATURED_CONTENT_COLLECTIONS,
  HOMEPAGE_FEATURED_CONTENT_SLOTS,
  type HomepageFeaturedCandidate,
  type HomepageFeaturedCandidatesResponse,
  type HomepageFeaturedCollection,
  type HomepageFeaturedInvalidItem,
  type HomepageFeaturedInvalidReason,
  type HomepageFeaturedItemRef,
  type HomepageFeaturedSelection,
} from './types'

const HOMEPAGE_FEATURED_COLLECTION_LABELS: Record<HomepageFeaturedCollection, string> = {
  articles: 'Standard Article',
  'single-type-listicles': 'Single Type Listicle',
  'listicle-itineraries': 'Listicle Itinerary',
}

type PayloadDocLike = {
  id?: unknown
  title?: unknown
  slug?: unknown
  status?: unknown
  updatedAt?: unknown
  publishedAt?: unknown
  headerSection?: unknown
  header?: unknown
  author?: unknown
  category?: unknown
  seoSection?: unknown
  seo?: unknown
}

type ParsedHomepageFeaturedSlot = {
  slot: number
  ref: HomepageFeaturedItemRef | null
  reason: HomepageFeaturedInvalidReason | null
}

type PayloadFindWhere = NonNullable<Parameters<Payload['find']>[0]['where']>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function extractSeoExcerpt(doc: PayloadDocLike): string | null {
  const topLevelSection = isRecord(doc.seoSection) ? doc.seoSection : null
  const seoRoot = isRecord(doc.seo) ? doc.seo : null
  const nestedSection = seoRoot && isRecord(seoRoot.seoSection) ? seoRoot.seoSection : null

  const section = topLevelSection ?? nestedSection
  if (!section) return null

  const meta = section.metaDescription
  if (typeof meta === 'string' && meta.trim()) return meta.trim()

  return null
}

function extractAuthorPreview(doc: PayloadDocLike): HomepageFeaturedCandidate['author'] {
  const author = doc.author
  if (!isRecord(author)) return null

  const first = typeof author.firstName === 'string' ? author.firstName.trim() : ''
  const last = typeof author.lastName === 'string' ? author.lastName.trim() : ''
  const name = [first, last].filter(Boolean).join(' ')

  const email = typeof author.email === 'string' ? author.email.trim() : ''
  const displayName = name || email || null

  return {
    id: normalizeNumericId(author.id),
    name: displayName,
    firstName: first || null,
    lastName: last || null,
  }
}

function extractCategoryPreview(doc: PayloadDocLike): HomepageFeaturedCandidate['category'] {
  const category = doc.category
  if (!isRecord(category)) return null

  const name = typeof category.name === 'string' && category.name.trim()
    ? category.name.trim()
    : null
  const slug = typeof category.slug === 'string' && category.slug.trim()
    ? category.slug.trim()
    : null

  return {
    id: normalizeNumericId(category.id),
    name,
    slug,
  }
}

function assetDisplayUrl(asset: Record<string, unknown>): string | null {
  const bunnyUrl = asset.bunny_original_url
  if (typeof bunnyUrl === 'string' && bunnyUrl) return bunnyUrl

  const url = asset.url
  return typeof url === 'string' && url ? url : null
}

function extractFeaturedImageUrl(doc: PayloadDocLike): string | null {
  // Articles use `headerSection`; listicles and itineraries use `header`
  const section = isRecord(doc.headerSection) ? doc.headerSection : isRecord(doc.header) ? doc.header : null
  if (!section) return null

  const featuredImage = section.featuredImage
  if (!isRecord(featuredImage)) return null

  // Prefer bunny_original_url (1200x630 OG image), fall back to the plugin-set url
  return assetDisplayUrl(featuredImage)
}

/** Prefer media-set square variant or a featured upload that is the square variant. */
function extractFeaturedSquareImageUrl(doc: PayloadDocLike): string | null {
  const section = isRecord(doc.headerSection) ? doc.headerSection : isRecord(doc.header) ? doc.header : null
  if (!section) return null

  const featuredImage = section.featuredImage
  if (!isRecord(featuredImage)) return null

  if (featuredImage.variant === 'square') {
    const direct = assetDisplayUrl(featuredImage)
    if (direct) return direct
  }

  const mediaSet = featuredImage.mediaSet
  if (!isRecord(mediaSet)) return null

  const variants = mediaSet.variants
  if (!isRecord(variants)) return null

  const square = variants.square
  if (isRecord(square)) {
    const u = assetDisplayUrl(square)
    if (u) return u
  }

  return null
}

function isHomepageFeaturedCollection(value: unknown): value is HomepageFeaturedCollection {
  return (
    typeof value === 'string'
    && HOMEPAGE_FEATURED_CONTENT_COLLECTIONS.includes(value as HomepageFeaturedCollection)
  )
}

function normalizeNumericId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.trunc(value)
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.trunc(parsed)
    }
  }

  return null
}

export function normalizeHomepageFeaturedRef(value: unknown): HomepageFeaturedItemRef | null {
  if (!isRecord(value)) return null

  const relationTo = value.relationTo
  if (!isHomepageFeaturedCollection(relationTo)) {
    return null
  }

  const directId = normalizeNumericId(value.id)
  if (directId !== null) {
    return {
      relationTo,
      id: directId,
    }
  }

  const nestedValue = value.value
  if (isRecord(nestedValue)) {
    const nestedId = normalizeNumericId(nestedValue.id)
    if (nestedId !== null) {
      return {
        relationTo,
        id: nestedId,
      }
    }
  }

  const valueId = normalizeNumericId(nestedValue)
  if (valueId !== null) {
    return {
      relationTo,
      id: valueId,
    }
  }

  return null
}

export function normalizeHomepageFeaturedInput(rawItems: unknown): HomepageFeaturedItemRef[] {
  if (!Array.isArray(rawItems)) return []

  const refs = rawItems.map((item) => normalizeHomepageFeaturedRef(item))

  if (refs.some((item) => item === null)) {
    throw new Error('Homepage featured content items must use supported collections and numeric ids.')
  }

  return refs as HomepageFeaturedItemRef[]
}

function parseHomepageFeaturedSlots(rawItems: unknown): ParsedHomepageFeaturedSlot[] {
  if (!Array.isArray(rawItems)) return []

  return rawItems.map((rawItem, index) => {
    const ref = normalizeHomepageFeaturedRef(rawItem)

    return {
      slot: index + 1,
      ref,
      reason: ref ? null : 'invalid_reference',
    }
  })
}

function buildHomepageFeaturedKey(ref: HomepageFeaturedItemRef): string {
  return `${ref.relationTo}:${ref.id}`
}

export function buildHomepageFeaturedGlobalData(items: HomepageFeaturedItemRef[]) {
  return {
    items: items.map((item) => ({
      relationTo: item.relationTo,
      value: item.id,
    })),
  }
}

function getHomepageFeaturedCollectionLabel(relationTo: HomepageFeaturedCollection): string {
  return HOMEPAGE_FEATURED_COLLECTION_LABELS[relationTo]
}

function normalizeHomepageFeaturedCandidate(
  relationTo: HomepageFeaturedCollection,
  doc: PayloadDocLike,
): HomepageFeaturedCandidate {
  const metaDescription = extractSeoExcerpt(doc)
  const author = extractAuthorPreview(doc)

  return {
    relationTo,
    id: normalizeNumericId(doc.id) ?? 0,
    title: typeof doc.title === 'string' && doc.title.trim() ? doc.title.trim() : 'Untitled',
    slug: typeof doc.slug === 'string' && doc.slug.trim() ? doc.slug : null,
    status: typeof doc.status === 'string' && doc.status.trim() ? doc.status : null,
    updatedAt: typeof doc.updatedAt === 'string' && doc.updatedAt.trim() ? doc.updatedAt : null,
    publishedAt: typeof doc.publishedAt === 'string' && doc.publishedAt.trim() ? doc.publishedAt : null,
    collectionLabel: getHomepageFeaturedCollectionLabel(relationTo),
    imageUrl: extractFeaturedImageUrl(doc),
    imageUrlSquare: extractFeaturedSquareImageUrl(doc),
    metaDescription,
    excerpt: metaDescription,
    author,
    authorLabel: author?.name ?? null,
    category: extractCategoryPreview(doc),
  }
}

async function findHomepageFeaturedDoc(
  payload: Payload,
  ref: HomepageFeaturedItemRef,
): Promise<HomepageFeaturedCandidate | null> {
  try {
    const doc = await payload.findByID({
      collection: ref.relationTo,
      id: ref.id,
      // Populate featuredImage → mediaSet → variants.square for `imageUrlSquare`
      depth: 3,
      overrideAccess: true,
    })

    return normalizeHomepageFeaturedCandidate(ref.relationTo, doc as PayloadDocLike)
  } catch {
    return null
  }
}

async function validateHomepageFeaturedDoc(
  payload: Payload,
  ref: HomepageFeaturedItemRef,
  allowDrafts: boolean,
): Promise<void> {
  const doc = await findHomepageFeaturedDoc(payload, ref)

  if (!doc) {
    throw new Error(`${getHomepageFeaturedCollectionLabel(ref.relationTo)} #${ref.id} could not be found.`)
  }

  if (!allowDrafts && doc.status !== 'published') {
    throw new Error(
      `${doc.collectionLabel} "${doc.title}" must be published before it can be featured.`,
    )
  }
}

function sortHomepageFeaturedCandidates(
  left: HomepageFeaturedCandidate,
  right: HomepageFeaturedCandidate,
): number {
  const leftTimestamp = Date.parse(left.updatedAt || left.publishedAt || '') || 0
  const rightTimestamp = Date.parse(right.updatedAt || right.publishedAt || '') || 0

  if (leftTimestamp !== rightTimestamp) {
    return rightTimestamp - leftTimestamp
  }

  return left.title.localeCompare(right.title)
}

export async function validateHomepageFeaturedItems(
  payload: Payload,
  refs: HomepageFeaturedItemRef[],
  options: {
    allowDrafts?: boolean
    slotCount?: number
  } = {},
): Promise<HomepageFeaturedItemRef[]> {
  const allowDrafts = options.allowDrafts ?? APP_CONFIG.features.homepageFeaturedAllowDrafts
  const slotCount = options.slotCount ?? HOMEPAGE_FEATURED_CONTENT_SLOTS

  if (refs.length !== slotCount) {
    throw new Error(`This block requires exactly ${slotCount} item${slotCount === 1 ? '' : 's'}.`)
  }

  const keys = new Set<string>()

  for (const ref of refs) {
    if (!isHomepageFeaturedCollection(ref.relationTo)) {
      throw new Error(`Unsupported homepage featured collection: ${String(ref.relationTo)}.`)
    }

    const key = buildHomepageFeaturedKey(ref)
    if (keys.has(key)) {
      throw new Error('Homepage featured content cannot contain duplicate entries.')
    }
    keys.add(key)
  }

  await Promise.all(refs.map((ref) => validateHomepageFeaturedDoc(payload, ref, allowDrafts)))

  return refs
}

export async function getHomepageFeaturedSelectionFromItems(
  payload: Payload,
  rawItems: unknown,
  options: {
    allowDrafts?: boolean
    totalSlots?: number
  } = {},
): Promise<HomepageFeaturedSelection> {
  const allowDrafts = options.allowDrafts ?? APP_CONFIG.features.homepageFeaturedAllowDrafts
  const totalSlots = options.totalSlots ?? HOMEPAGE_FEATURED_CONTENT_SLOTS
  const parsedSlots = parseHomepageFeaturedSlots(rawItems)
  const items: HomepageFeaturedCandidate[] = []
  const invalidItems: HomepageFeaturedInvalidItem[] = []

  for (const slot of parsedSlots) {
    if (!slot.ref) {
      invalidItems.push({
        slot: slot.slot,
        reason: slot.reason || 'invalid_reference',
      })
      continue
    }

    const candidate = await findHomepageFeaturedDoc(payload, slot.ref)

    if (!candidate) {
      invalidItems.push({
        slot: slot.slot,
        relationTo: slot.ref.relationTo,
        id: slot.ref.id,
        collectionLabel: getHomepageFeaturedCollectionLabel(slot.ref.relationTo),
        reason: 'not_found',
      })
      continue
    }

    if (!allowDrafts && candidate.status !== 'published') {
      invalidItems.push({
        slot: slot.slot,
        relationTo: candidate.relationTo,
        id: candidate.id,
        collectionLabel: candidate.collectionLabel,
        reason: 'not_published',
      })
      continue
    }

    items.push({
      ...candidate,
      slot: slot.slot,
    })
  }

  return {
    items,
    invalidItems,
    allowDrafts,
    isComplete:
      items.length === totalSlots
      && invalidItems.length === 0
      && parsedSlots.length === totalSlots,
    totalSlots,
  }
}

/** API selection shape for `newsletter-signup` blocks (no curated items). */
export function getNewsletterSignupPlaceholderSelection(options?: {
  allowDrafts?: boolean
}): HomepageFeaturedSelection {
  return {
    items: [],
    invalidItems: [],
    allowDrafts: options?.allowDrafts ?? APP_CONFIG.features.homepageFeaturedAllowDrafts,
    isComplete: true,
    totalSlots: 0,
  }
}

export async function searchHomepageFeaturedCandidates(
  payload: Payload,
  options: {
    query?: string
    type?: string | null
    page?: number
    limit?: number
    allowDrafts?: boolean
  } = {},
): Promise<HomepageFeaturedCandidatesResponse> {
  const query = options.query?.trim() || ''
  const allowDrafts = options.allowDrafts ?? APP_CONFIG.features.homepageFeaturedAllowDrafts
  const page = Number.isFinite(options.page) && (options.page || 0) > 0 ? Math.trunc(options.page!) : 1
  const limit = Number.isFinite(options.limit) && (options.limit || 0) > 0
    ? Math.min(Math.trunc(options.limit!), 50)
    : 24
  const effectiveCollections = isHomepageFeaturedCollection(options.type)
    ? [options.type]
    : [...HOMEPAGE_FEATURED_CONTENT_COLLECTIONS]
  const perCollectionLimit = page * limit

  const results = await Promise.all(
    effectiveCollections.map(async (collection) => {
      const whereClauses: PayloadFindWhere[] = []

      if (query) {
        whereClauses.push({
          or: [
            {
              title: {
                like: query,
              },
            },
            {
              slug: {
                like: query,
              },
            },
          ],
        })
      }

      if (!allowDrafts) {
        whereClauses.push({
          status: {
            equals: 'published',
          },
        })
      }

      const where: PayloadFindWhere | undefined = whereClauses.length > 1
        ? { and: whereClauses }
        : whereClauses[0]

      const response = await payload.find({
        collection,
        depth: 3,
        limit: perCollectionLimit,
        page: 1,
        sort: '-updatedAt',
        where,
        overrideAccess: true,
      })

      return {
        collection,
        docs: (response.docs || []).map((doc) =>
          normalizeHomepageFeaturedCandidate(collection, doc as PayloadDocLike),
        ),
        totalDocs: response.totalDocs || 0,
      }
    }),
  )

  const allDocs = results
    .flatMap((result) => result.docs)
    .sort(sortHomepageFeaturedCandidates)
  const totalDocs = results.reduce((sum, result) => sum + result.totalDocs, 0)
  const start = (page - 1) * limit
  const docs = allDocs.slice(start, start + limit)

  return {
    docs,
    totalDocs,
    totalPages: Math.max(1, Math.ceil(totalDocs / limit)),
    page,
    limit,
    allowDrafts,
  }
}
