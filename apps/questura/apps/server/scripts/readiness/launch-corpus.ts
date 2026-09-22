/**
 * The launch corpus: about fifty realistic published pieces, and the people
 * who read them (surge plan L01).
 *
 *   pnpm readiness bootstrap            # schema from the committed fixture
 *   pnpm readiness:launch -- seed       # this corpus, into the sandbox
 *   pnpm readiness:launch -- verify     # counts and markers, against the DB
 *
 * Why fifty and not sixteen thousand: the campaign this prepares for sends a
 * crowd to a handful of pages. What matters is that each page type exists
 * with a real body — standard articles, maps (single-type listicles) and
 * itineraries, free and members-only — plus the drafts, deletions and
 * searches that make correctness checks mean something. The large corpora in
 * `corpus.ts` answer a different question and stay where they are.
 *
 * Everything is written through Payload's Local API, so hooks, derived
 * fields, canonical paths and the search index are produced by the real
 * code, not imitated in SQL. Two exceptions, both stated: media rows are
 * inserted directly (an upload would need Bunny), pointing at the local
 * fixture media server (`media-server.ts`); and visitor accounts are created
 * through Better Auth's internal adapter with a real password hash, because
 * its sign-up endpoint mails a verification link.
 *
 * Deterministic: no randomness, no clock in any value a check compares. Every
 * piece carries unique markers — a title marker, a body marker with a
 * revision, and for members-only pieces a member marker that must never
 * appear in a public response. The expected values are written to the
 * workload manifest (`load/k6/manifests/launch-v1.json`), which every other
 * script reads instead of repeating them.
 *
 * Refuses to run anywhere preflight refuses. Loopback-only at the socket
 * (`deny-outbound.cjs`, loaded by the npm script).
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Pool } from 'pg'

import { sandboxDatabaseUri } from './database'
import { assertPreflight } from './preflight'
import { sandboxSettings } from './sandbox'

const HERE = dirname(fileURLToPath(import.meta.url))
export const LAUNCH_MANIFEST_PATH = resolve(HERE, '../../../../load/k6/manifests/launch-v1.json')

export const LAUNCH_VERSION = 'launch-v1'
export const LAUNCH_COUNTRY = { slug: 'zz-launch', name: 'Launchland' }
export const LAUNCH_CITIES = [
  { slug: 'harbor', name: 'Harbor', neighborhoods: ['docks', 'lighthouse'] },
  { slug: 'old-quarter', name: 'Old Quarter', neighborhoods: ['cathedral', 'market'] },
  { slug: 'river-bend', name: 'River Bend', neighborhoods: ['mill', 'meadow'] },
  { slug: 'hillside', name: 'Hillside', neighborhoods: ['terraces', 'summit'] },
] as const

/** Fixture media is served by the harness, never by a CDN. */
export const MEDIA_ORIGIN = 'http://127.0.0.1:3190'

/**
 * Published counts by type. Fifty in total: the shape of a launch, with
 * members-only pieces in every format that supports them. Maps (single-type
 * listicles) are never gated — they earn from ads and have no access tier —
 * so their member count is zero by product design, not by omission.
 */
export const LAUNCH_SHAPE = {
  articles: { published: 26, member: 7, drafts: 2 },
  maps: { published: 12, member: 0, drafts: 1 },
  itineraries: { published: 12, member: 4, drafts: 1 },
} as const

/** Synthetic password for every synthetic account. Not a secret: these rows live in a disposable database. */
export const SYNTHETIC_PASSWORD = 'Readiness-Synthetic-2026!'

export const LAUNCH_IDENTITIES = [
  { label: 'member-a', email: 'member-a@example.com', name: 'Member Ada', member: true, expired: false },
  { label: 'member-b', email: 'member-b@example.com', name: 'Member Bo', member: true, expired: false },
  { label: 'nonmember', email: 'nonmember@example.com', name: 'Reader Nia', member: false, expired: false },
  { label: 'expired', email: 'expired@example.com', name: 'Reader Ezra', member: true, expired: true },
] as const

export const STAFF_EMAIL = 'readiness-admin@example.com'

// ---------------------------------------------------------------------------
// Deterministic text.
// ---------------------------------------------------------------------------

const WORDS = (
  'harbor morning light market stall bread coffee lane stone arch river quiet evening walk ' +
  'bridge garden terrace view hill cathedral bell square fountain courtyard museum gallery ' +
  'tram station ferry dock lighthouse wind tide fishermen lantern supper wine olive salt ' +
  'bakery vendor shade window balcony tile mosaic path stair orchard meadow mill wheel'
).split(' ')

/** `count` words chosen by position, never by chance. */
function prose(seed: number, count: number): string {
  const words: string[] = []
  for (let index = 0; index < count; index += 1) words.push(WORDS[(seed * 31 + index * 7) % WORDS.length]!)
  const sentence = words.join(' ')
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + '.'
}

function lexical(...paragraphs: string[]) {
  return {
    root: {
      type: 'root',
      format: '' as const,
      indent: 0,
      version: 1,
      direction: 'ltr' as const,
      children: paragraphs.map((text) => ({
        type: 'paragraph',
        format: '',
        indent: 0,
        version: 1,
        direction: 'ltr',
        textFormat: 0,
        children: [{ type: 'text', text, format: 0, detail: 0, mode: 'normal', style: '', version: 1 }],
      })),
    },
  }
}

// ---------------------------------------------------------------------------
// The manifest other scripts read.
// ---------------------------------------------------------------------------

export type LaunchType = 'articles' | 'maps' | 'itineraries'

export type LaunchPiece = {
  type: LaunchType
  /** Index within its type, stable across seeds. */
  index: number
  id: number
  slug: string
  path: string
  city: string
  access: 'free' | 'member'
  status: 'published' | 'draft'
  markers: {
    /** In the title and the headline. */
    title: string
    /** In the public (free) part of the body. Carries the revision. */
    body: string
    /** Only in the members-only part. Must never appear in a public response. */
    member: string | null
  }
  revision: number
}

export type LaunchManifest = {
  version: string
  seed: number
  counts: Record<LaunchType, { published: number; member: number; drafts: number }> & { publishedTotal: number }
  pieces: LaunchPiece[]
  retired: { type: LaunchType; id: number; path: string; slug: string; titleMarker: string }
  missingPaths: string[]
  cities: Array<{ slug: string; path: string }>
  authors: Array<{ id: number; slug: string | null; path: string | null }>
  searches: Array<{ q: string; expect: 'none' | 'one' | 'many'; expectedPaths?: string[] }>
  identities: Array<{
    label: string
    email: string
    expect: { authenticated: boolean; member: boolean }
    bookmarks: Array<{ targetType: LaunchType; targetId: number }>
  }>
  mediaOrigin: string
}

const pad = (value: number, width = 2) => String(value).padStart(width, '0')

export function markerFor(type: LaunchType, index: number, revision = 1) {
  const short = type === 'articles' ? 'ART' : type === 'maps' ? 'MAP' : 'ITN'
  return {
    title: `LM-${short}-${pad(index)}`,
    body: `BODY-${short}-${pad(index)}-R${revision}`,
    member: `MEMBERONLY-${short}-${pad(index)}`,
  }
}

// ---------------------------------------------------------------------------
// Seeding.
// ---------------------------------------------------------------------------

type PayloadLike = {
  create: (args: Record<string, unknown>) => Promise<Record<string, unknown>>
  update: (args: Record<string, unknown>) => Promise<Record<string, unknown>>
  find: (args: Record<string, unknown>) => Promise<{ docs: Array<Record<string, unknown>> }>
  updateGlobal: (args: Record<string, unknown>) => Promise<unknown>
}

const LOCAL = { overrideAccess: true, depth: 0 } as const

async function insertMedia(pool: Pool, count: number): Promise<number[]> {
  const ids: number[] = []
  for (let index = 0; index < count; index += 1) {
    const filename = `launch-${pad(index)}.jpg`
    const result = await pool.query<{ id: number }>(
      `INSERT INTO media_assets (url, filename, mime_type, filesize, width, height, alt_text, updated_at, created_at)
       VALUES ($1, $2, 'image/jpeg', 2048, 1600, 1000, $3, now(), now()) RETURNING id`,
      [`${MEDIA_ORIGIN}/media/${filename}`, filename, `Launchland view ${index + 1}`],
    )
    ids.push(result.rows[0]!.id)
  }
  return ids
}

/**
 * Media sets over the fixture assets: every variant points at one asset, so
 * the public serializers find the shape they expect (hero, wide, square…)
 * and every URL still resolves to the local media server.
 */
async function insertMediaSets(pool: Pool, assets: number[]): Promise<number[]> {
  const ids: number[] = []
  for (const [index, asset] of assets.entries()) {
    const result = await pool.query<{ id: number }>(
      `INSERT INTO media_sets (title, alt_text, variants_thumbnail_id, variants_square_id, variants_wide_id,
         variants_portrait_id, variants_hero_id, variants_open_graph_id, variants_editorial_id, status, updated_at, created_at)
       VALUES ($1, $2, $3, $3, $3, $3, $3, $3, $3, 'complete', now(), now()) RETURNING id`,
      [`Launch set ${pad(index)}`, `Launchland view ${index + 1}`, asset],
    )
    ids.push(result.rows[0]!.id)
  }
  return ids
}

async function insertLocations(pool: Pool): Promise<Map<string, number>> {
  const ids = new Map<string, number>()
  const insert = async (
    key: string,
    level: string,
    city: string | null,
    neighborhood: string | null,
    parent: string | null,
    cityName: string | null,
    neighborhoodName: string | null,
  ) => {
    const result = await pool.query<{ id: number }>(
      `INSERT INTO locations (country, city, neighborhood, location_key, level, parent_key, country_name, city_name, neighborhood_name, updated_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), now()) RETURNING id`,
      [LAUNCH_COUNTRY.slug, city, neighborhood, key, level, parent, LAUNCH_COUNTRY.name, cityName, neighborhoodName],
    )
    ids.set(key, result.rows[0]!.id)
  }

  await insert(LAUNCH_COUNTRY.slug, 'country', null, null, null, null, null)
  for (const city of LAUNCH_CITIES) {
    const cityKey = `${LAUNCH_COUNTRY.slug}|${city.slug}`
    await insert(cityKey, 'city', city.slug, null, LAUNCH_COUNTRY.slug, city.name, null)
    for (const neighborhood of city.neighborhoods) {
      await insert(
        `${cityKey}|${neighborhood}`,
        'neighborhood',
        city.slug,
        neighborhood,
        cityKey,
        city.name,
        neighborhood.charAt(0).toUpperCase() + neighborhood.slice(1),
      )
    }
  }
  return ids
}

function articleBlocks(index: number, member: boolean, mediaId: number) {
  const marker = markerFor('articles', index)
  const blocks: Array<Record<string, unknown>> = []
  // Opening: the public sample always carries the body marker.
  blocks.push({ blockType: 'text', content: lexical(`${marker.body} ${prose(index, 60)}`, prose(index + 1, 55)) })
  blocks.push({ blockType: 'key-takeaway', label: 'In short', items: [{ text: prose(index + 2, 14) }, { text: prose(index + 3, 12) }] })
  for (let section = 0; section < 6; section += 1) {
    blocks.push({ blockType: 'text', content: lexical(prose(index * 10 + section, 70), prose(index * 10 + section + 5, 64)) })
    if (section === 2) blocks.push({ blockType: 'image', image: mediaId, altText: `Launchland scene ${index}` })
    if (section === 3) blocks.push({ blockType: 'pull-quote', quote: prose(index + 40, 16) })
  }
  blocks.push({
    blockType: 'faq',
    label: 'Questions',
    items: [
      { question: `When should you visit ${marker.title}?`, answer: prose(index + 50, 30) },
      { question: 'Is it busy?', answer: prose(index + 51, 26) },
    ],
  })
  // Closing: for members-only pieces, the member marker lives only here —
  // well past any free sample.
  blocks.push({
    blockType: 'text',
    content: lexical(member ? `${marker.member} ${prose(index + 60, 50)}` : prose(index + 60, 50)),
  })
  return blocks
}

function itemBlurb(seed: number, marker: string | null) {
  return lexical(marker ? `${marker} ${prose(seed, 45)}` : prose(seed, 45))
}

export async function seedLaunchCorpus(payload: PayloadLike, pool: Pool, seed: number): Promise<LaunchManifest> {
  const media = await insertMedia(pool, 8)
  const mediaSets = await insertMediaSets(pool, media)
  await insertLocations(pool)

  // Staff and a service account: synthetic, for the credential matrix.
  const staff = await payload.create({
    collection: 'users',
    data: { email: STAFF_EMAIL, password: SYNTHETIC_PASSWORD, role: 'admin', status: 'active', firstName: 'Readiness', lastName: 'Admin' },
    ...LOCAL,
  })
  await payload.create({
    collection: 'service-accounts',
    data: { name: 'Readiness Location Manager', enableAPIKey: true },
    ...LOCAL,
  })

  const authorNames = ['Mara Quill', 'Tomas Reyes', 'Ines Park']
  const authors: number[] = []
  for (const displayName of authorNames) {
    const author = await payload.create({ collection: 'authors', data: { displayName }, ...LOCAL })
    authors.push(author.id as number)
  }

  const staffReq = { user: { ...staff, collection: 'users' } }

  // A published article's category is part of its public URL.
  const categories: number[] = []
  for (const name of ['Food and drink', 'Neighbourhoods', 'Culture']) {
    const category = await payload.create({ collection: 'article-categories', data: { name }, ...LOCAL })
    categories.push(category.id as number)
  }
  const pieces: LaunchPiece[] = []
  const cityFor = (index: number) => LAUNCH_CITIES[index % LAUNCH_CITIES.length]!

  // Places for maps and itineraries: six of each kind per city, each with a
  // one-photo gallery, because a list item must pick photos from its venue's
  // own gallery and a venue must sit inside the list's city.
  type Place = { id: number; photo: number }
  const places = { dining: new Map<string, Place[]>(), attractions: new Map<string, Place[]>(), accommodations: new Map<string, Place[]>() }
  const labels = { dining: 'Table', attractions: 'Sight', accommodations: 'Stay' } as const
  for (const [cityIndex, city] of LAUNCH_CITIES.entries()) {
    const location = `${LAUNCH_COUNTRY.slug}|${city.slug}`
    for (const kind of Object.keys(places) as Array<keyof typeof places>) {
      const list: Place[] = []
      for (let slot = 0; slot < 6; slot += 1) {
        const number = cityIndex * 6 + slot
        const photo = mediaSets[number % mediaSets.length]!
        const created = await payload.create({
          collection: kind,
          data: {
            title: `Launch ${labels[kind]} ${city.name} ${pad(slot)}`,
            location,
            status: 'published',
            latitude: 10 + number * 0.01,
            longitude: -70 - number * 0.01,
            gallery: [{ image: photo }],
          },
          ...LOCAL,
        })
        list.push({ id: created.id as number, photo })
      }
      places[kind].set(city.slug, list)
    }
  }
  const placesIn = (kind: keyof typeof places, city: string) => places[kind].get(city)!

  const record = async (type: LaunchType, index: number, doc: Record<string, unknown>, access: 'free' | 'member', status: 'published' | 'draft', city: string) => {
    const fresh = await payload.find({
      collection: type === 'articles' ? 'articles' : type === 'maps' ? 'single-type-listicles' : 'listicle-itineraries',
      where: { id: { equals: doc.id } },
      ...LOCAL,
    })
    const saved = fresh.docs[0]!
    const marker = markerFor(type, index)
    // Standard articles store their canonical path (it includes the
    // category); maps and itineraries are routed by convention.
    const path =
      type === 'articles'
        ? (saved.canonicalPath as string)
        : `/${LAUNCH_COUNTRY.slug}/${city}/${type}/${saved.slug as string}`
    pieces.push({
      type,
      index,
      id: saved.id as number,
      slug: saved.slug as string,
      path,
      city,
      access,
      status,
      markers: { title: marker.title, body: marker.body, member: access === 'member' ? marker.member : null },
      revision: 1,
    })
  }

  // Standard articles.
  const articleTotal = LAUNCH_SHAPE.articles.published + LAUNCH_SHAPE.articles.drafts
  for (let index = 0; index < articleTotal; index += 1) {
    const city = cityFor(index)
    const member = index < LAUNCH_SHAPE.articles.member
    const draft = index >= LAUNCH_SHAPE.articles.published
    const marker = markerFor('articles', index)
    const doc = await payload.create({
      collection: 'articles',
      data: {
        title: `${marker.title} ${city.name} ${prose(index, 5).replace(/\.$/, '')}`,
        slug: `launch-article-${pad(index)}`,
        location: `${LAUNCH_COUNTRY.slug}|${city.slug}`,
        step1_complete: true,
        headerSection: { featuredImage: media[index % media.length] },
        contentBlocks: articleBlocks(index, member, media[(index + 1) % media.length]!),
        category: categories[index % categories.length],
        seoSection: { metaDescription: `${marker.title}: ${prose(index + 80, 14)}`, title: `${marker.title} ${city.name}` },
        status: draft ? 'draft' : 'published',
        access: member ? 'member' : 'free',
        language: 'en',
        author: authors[index % authors.length],
      },
      req: staffReq,
      ...LOCAL,
    })
    await record('articles', index, doc, member ? 'member' : 'free', draft ? 'draft' : 'published', city.slug)
  }

  // Maps.
  const mapTotal = LAUNCH_SHAPE.maps.published + LAUNCH_SHAPE.maps.drafts
  for (let index = 0; index < mapTotal; index += 1) {
    const city = cityFor(index)
    const member = index < LAUNCH_SHAPE.maps.member
    const draft = index >= LAUNCH_SHAPE.maps.published
    const marker = markerFor('maps', index)
    const dining = index % 2 === 0
    const venues = placesIn(dining ? 'dining' : 'attractions', city.slug)
    const items = venues.map((venue, slot) => ({
      blockType: dining ? 'data-dining' : 'data-attractions',
      item: venue.id,
      mediaMode: 'photos',
      selectedPhotos: [venue.photo],
      blurb: itemBlurb(index * 10 + slot, slot === 0 ? marker.body : slot === 5 && member ? marker.member : null),
    }))
    const doc = await payload.create({
      collection: 'single-type-listicles',
      data: {
        title: `${marker.title} ${city.name} ${dining ? 'tables' : 'sights'} ${pad(index)}`,
        slug: `launch-map-${pad(index)}`,
        location: `${LAUNCH_COUNTRY.slug}|${city.slug}`,
        listicleType: dining ? 'dining' : 'attractions',
        seoSection: { metaDescription: `${marker.title}: ${prose(index + 81, 14)}`, title: marker.title },
        targetItemCount: 6,
        step1_complete: true,
        header: { intro: lexical(`${marker.body} ${prose(index + 70, 40)}`), featuredImage: media[index % media.length] },
        items,
        status: draft ? 'draft' : 'published',
        language: 'en',
        author: authors[index % authors.length],
      },
      req: staffReq,
      ...LOCAL,
    })
    await record('maps', index, doc, member ? 'member' : 'free', draft ? 'draft' : 'published', city.slug)
  }

  // Itineraries.
  const itineraryTotal = LAUNCH_SHAPE.itineraries.published + LAUNCH_SHAPE.itineraries.drafts
  for (let index = 0; index < itineraryTotal; index += 1) {
    const city = cityFor(index)
    const member = index < LAUNCH_SHAPE.itineraries.member
    const draft = index >= LAUNCH_SHAPE.itineraries.published
    const marker = markerFor('itineraries', index)
    const stays = placesIn('accommodations', city.slug)
    const tables = placesIn('dining', city.slug)
    const sights = placesIn('attractions', city.slug)
    const days = Array.from({ length: 3 }, (_, day) => ({
      whereStaying: [
        {
          blockType: 'itinerary-where-staying',
          item: stays[day]!.id,
          mediaMode: 'photos',
          selectedPhotos: [stays[day]!.photo],
          blurb: itemBlurb(index * 20 + day, null),
        },
      ],
      items: [
        {
          blockType: 'itinerary-dining',
          item: tables[day]!.id,
          mediaMode: 'photos',
          selectedPhotos: [tables[day]!.photo],
          blurb: itemBlurb(index * 20 + day + 3, day === 0 ? marker.body : null),
        },
        {
          blockType: 'itinerary-attractions',
          item: sights[day]!.id,
          mediaMode: 'photos',
          selectedPhotos: [sights[day]!.photo],
          blurb: itemBlurb(index * 20 + day + 6, day === 2 && member ? marker.member : null),
        },
      ],
    }))
    const doc = await payload.create({
      collection: 'listicle-itineraries',
      data: {
        title: `${marker.title} Three days in ${city.name} ${pad(index)}`,
        slug: `launch-itinerary-${pad(index)}`,
        location: `${LAUNCH_COUNTRY.slug}|${city.slug}`,
        step1_complete: true,
        // The intro is the part of an itinerary every reader sees, gated or
        // not, so the public body marker lives there.
        header: { intro: lexical(`${marker.body} ${prose(index + 90, 40)}`), featuredImage: media[index % media.length] },
        dayCount: 3,
        seoSection: { metaDescription: `${marker.title}: ${prose(index + 82, 14)}`, title: marker.title },
        itineraryDays: days,
        status: draft ? 'draft' : 'published',
        access: member ? 'member' : 'free',
        language: 'en',
        author: authors[index % authors.length],
      },
      req: staffReq,
      ...LOCAL,
    })
    await record('itineraries', index, doc, member ? 'member' : 'free', draft ? 'draft' : 'published', city.slug)
  }

  // A piece that was published, bookmarked, then unpublished: the
  // "later-unpublished target" every bookmark and cache check needs.
  const retiredMarker = { title: 'LM-RETIRED-01' }
  const retiredDoc = await payload.create({
    collection: 'articles',
    data: {
      title: `${retiredMarker.title} Harbor farewell`,
      slug: 'launch-retired-01',
      location: `${LAUNCH_COUNTRY.slug}|harbor`,
      step1_complete: true,
      headerSection: { featuredImage: media[0] },
      contentBlocks: articleBlocks(99, false, media[1]!),
      category: categories[0],
      seoSection: { metaDescription: `${retiredMarker.title}: ${prose(98, 14)}`, title: retiredMarker.title },
      status: 'published',
      access: 'free',
      language: 'en',
      author: authors[0],
    },
    req: staffReq,
    ...LOCAL,
  })
  const retiredFresh = (await payload.find({ collection: 'articles', where: { id: { equals: retiredDoc.id } }, ...LOCAL })).docs[0]!

  // City pages: an article grid per city, from that city's published pieces.
  const locations = await pool.query<{ id: number; location_key: string }>(
    `SELECT id, location_key FROM locations WHERE country = $1 AND level = 'city'`,
    [LAUNCH_COUNTRY.slug],
  )
  for (const row of locations.rows) {
    const citySlug = row.location_key.split('|')[1]!
    const inCity = pieces.filter((piece) => piece.city === citySlug && piece.status === 'published' && piece.type === 'articles')
    const blocks = [
      {
        blockType: 'article-grid',
        slotCount: 4,
        sectionHeading: `Reading ${citySlug}`,
        items: inCity.slice(0, 4).map((piece) => ({ relationTo: 'articles', value: piece.id })),
      },
    ]
    await payload.create({
      collection: 'location-homepages',
      data: {
        location: row.id,
        isEnabled: true,
        pageBlocks: blocks,
        draftPageBlocks: blocks,
        publishedPageBlocks: blocks,
        lastPublishedAt: new Date(Date.UTC(2026, 8, 22)).toISOString(),
        publishedRevision: 1,
      },
      ...LOCAL,
    })
  }

  // Visitors: real password hashes, verified email, synthetic entitlement.
  const { visitorAuth } = await import('../../src/features/visitor-auth/lib/better-auth')
  const { ensureVisitorProfileForAuthUser } = await import('../../src/features/visitor-auth/lib/visitor-profile')
  const context = await visitorAuth.$context
  const identities: LaunchManifest['identities'] = []
  const publishedPieces = pieces.filter((piece) => piece.status === 'published')
  for (const [position, identity] of LAUNCH_IDENTITIES.entries()) {
    const user = await context.internalAdapter.createUser({ email: identity.email, name: identity.name, emailVerified: true })
    await context.internalAdapter.linkAccount({
      userId: user.id,
      providerId: 'credential',
      accountId: user.id,
      password: await context.password.hash(SYNTHETIC_PASSWORD),
    })
    await ensureVisitorProfileForAuthUser({ id: user.id, email: identity.email, name: identity.name })
    if (identity.member) {
      // Paid through a fixed far-future date: entitlement is derived from it
      // (ADR-0008), and no Stripe object exists or is needed.
      await pool.query(
        `UPDATE visitor_profiles SET paid_through_at = '2099-01-01T00:00:00Z', subscription_status = 'active' WHERE auth_user_id = $1`,
        [user.id],
      )
    }

    // Bookmarks for A and B: distinct sets, one gated target each, and A
    // holds the later-retired piece.
    const bookmarks: LaunchManifest['identities'][number]['bookmarks'] = []
    if (identity.label === 'member-a' || identity.label === 'member-b') {
      const offset = identity.label === 'member-a' ? 0 : 3
      const gated = publishedPieces.find((piece) => piece.access === 'member' && piece.type === (identity.label === 'member-a' ? 'articles' : 'itineraries'))!
      const chosen = [publishedPieces[10 + offset]!, publishedPieces[11 + offset]!, gated]
      for (const piece of chosen) bookmarks.push({ targetType: piece.type, targetId: piece.id })
      if (identity.label === 'member-a') bookmarks.push({ targetType: 'articles', targetId: retiredFresh.id as number })
      for (const bookmark of bookmarks) {
        await pool.query(
          `INSERT INTO bookmarks (auth_user_id, target_type, target_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $4) ON CONFLICT DO NOTHING`,
          [user.id, bookmark.targetType, bookmark.targetId, new Date(Date.UTC(2026, 8, 22, 0, position)).toISOString()],
        )
      }
    }

    identities.push({
      label: identity.label,
      email: identity.email,
      // The expired session is a member whose *session* is gone: identity
      // must read as signed out, whatever the profile says.
      expect: { authenticated: !identity.expired, member: identity.member && !identity.expired },
      bookmarks,
    })
  }

  // Now retire it: unpublished after being bookmarked.
  await payload.update({ collection: 'articles', id: retiredDoc.id, data: { status: 'draft' }, req: staffReq, ...LOCAL })

  const published = pieces.filter((piece) => piece.status === 'published')
  const counts = {
    articles: { ...LAUNCH_SHAPE.articles },
    maps: { ...LAUNCH_SHAPE.maps },
    itineraries: { ...LAUNCH_SHAPE.itineraries },
    publishedTotal: published.length,
  }

  const authorRows = await pool.query<{ id: number; slug: string | null }>(`SELECT id, slug FROM authors ORDER BY id`)

  return {
    version: LAUNCH_VERSION,
    seed,
    counts,
    pieces,
    retired: {
      type: 'articles',
      id: retiredFresh.id as number,
      slug: retiredFresh.slug as string,
      path: retiredFresh.canonicalPath as string,
      titleMarker: retiredMarker.title,
    },
    missingPaths: [`/${LAUNCH_COUNTRY.slug}/harbor/articles/launch-does-not-exist`, `/${LAUNCH_COUNTRY.slug}/nowhere`],
    cities: LAUNCH_CITIES.map((city) => ({ slug: city.slug, path: `/${LAUNCH_COUNTRY.slug}/${city.slug}` })),
    authors: authorRows.rows.map((row) => ({ id: row.id, slug: row.slug, path: row.slug ? `/authors/${row.slug}` : null })),
    searches: [
      { q: 'zzqqnomatch', expect: 'none' },
      { q: markerFor('articles', 7).title, expect: 'one', expectedPaths: [published.find((p) => p.type === 'articles' && p.index === 7)!.path] },
      { q: 'Harbor', expect: 'many' },
    ],
    identities,
    mediaOrigin: MEDIA_ORIGIN,
  }
}

export function writeLaunchManifest(manifest: LaunchManifest, path = LAUNCH_MANIFEST_PATH): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n')
}

/** Counts and markers straight from the database, independent of the seeder's own bookkeeping. */
export async function verifyLaunchCorpus(pool: Pool): Promise<{ problems: string[]; counts: Record<string, number> }> {
  const problems: string[] = []
  const count = async (table: string, where: string) =>
    (await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table} WHERE ${where}`)).rows[0]!.n

  const counts = {
    articlesPublished: await count('articles', `slug LIKE 'launch-article-%' AND status = 'published'`),
    articlesMember: await count('articles', `slug LIKE 'launch-article-%' AND status = 'published' AND access = 'member'`),
    articlesDraft: await count('articles', `slug LIKE 'launch-%' AND status = 'draft'`),
    mapsPublished: await count('single_type_listicles', `slug LIKE 'launch-map-%' AND status = 'published'`),
    itinerariesPublished: await count('listicle_itineraries', `slug LIKE 'launch-itinerary-%' AND status = 'published'`),
    visitors: await count('visitor_auth_users', `email LIKE '%@example.com'`),
    members: await count('visitor_profiles', `paid_through_at > now()`),
    bookmarks: await count('bookmarks', 'true'),
    searchRows: await count('public_search_documents', 'true'),
    cityPages: await count('location_homepages', 'is_enabled'),
  }

  const expect = (name: keyof typeof counts, value: number) => {
    if (counts[name] !== value) problems.push(`${name}: expected ${value}, found ${counts[name]}`)
  }
  expect('articlesPublished', LAUNCH_SHAPE.articles.published)
  expect('articlesMember', LAUNCH_SHAPE.articles.member)
  expect('articlesDraft', LAUNCH_SHAPE.articles.drafts + 1)
  expect('mapsPublished', LAUNCH_SHAPE.maps.published)
  expect('itinerariesPublished', LAUNCH_SHAPE.itineraries.published)
  expect('visitors', LAUNCH_IDENTITIES.length)
  expect('members', LAUNCH_IDENTITIES.filter((identity) => identity.member).length)
  expect('cityPages', LAUNCH_CITIES.length)

  return { problems, counts }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2).filter((entry) => entry !== '--')
  const command = argv[0] ?? 'verify'
  const settings = sandboxSettings()
  assertPreflight(settings)
  const seed = Number(process.env.READINESS_SEED ?? 20260922)
  const pool = new Pool({ connectionString: sandboxDatabaseUri(), max: 4 })

  try {
    if (command === 'seed') {
      Object.assign(process.env, {
        DATABASE_URI: settings.databaseUri,
        DATABASE_URI_UNPOOLED: settings.databaseUri,
        REDIS_URL: '',
        PAYLOAD_SECRET: 'readiness-payload-secret-not-a-real-one-0123456789abcdef0123',
        BETTER_AUTH_SECRET: 'readiness-visitor-secret-not-a-real-one-0123456789abcdef01',
        // Revalidation jobs are recorded, not delivered: nothing is listening yet.
        REFRESH_DISCONNECTED: '1',
        REFRESH_WORKER_INTERVAL_MS: '0',
      })
      for (const name of ['STRIPE_SECRET_KEY', 'BUNNY_API_KEY', 'BUNNY_STORAGE_API_KEY', 'RESEND_API_KEY', 'GOOGLE_MAPS_API_KEY', 'GOOGLE_CLIENT_SECRET', 'SENTRY_DSN', 'ENDORSELY_API_KEY']) {
        delete process.env[name]
      }

      const existing = await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM articles WHERE slug LIKE 'launch-%'`)
      if (existing.rows[0]!.n > 0) {
        throw new Error('The sandbox already holds a launch corpus. Run `pnpm readiness bootstrap` first; seeding is from a clean schema only.')
      }

      const { getPayload } = await import('payload')
      const config = await import('../../src/payload.config')
      const payload = (await getPayload({ config: config.default })) as unknown as PayloadLike

      const started = Date.now()
      const manifest = await seedLaunchCorpus(payload, pool, seed)

      // Build the search index and settle the outbox the seeding produced.
      const { drainRefreshJobs } = await import('../../src/features/refresh-outbox/worker')
      for (let pass = 0; pass < 20; pass += 1) {
        const result = await drainRefreshJobs(pool as never, { maxJobs: 500, maxMs: 30_000 })
        if (result.claimed === 0) break
      }

      writeLaunchManifest(manifest)
      const verified = await verifyLaunchCorpus(pool)
      console.log(`Seeded ${LAUNCH_VERSION} in ${Date.now() - started}ms: ${manifest.counts.publishedTotal} published pieces.`)
      console.log(JSON.stringify(verified.counts))
      if (verified.problems.length > 0) throw new Error(`Verification failed:\n  ${verified.problems.join('\n  ')}`)
      process.exit(0)
    }

    if (command === 'verify') {
      const verified = await verifyLaunchCorpus(pool)
      console.log(JSON.stringify(verified.counts))
      if (verified.problems.length > 0) throw new Error(`Verification failed:\n  ${verified.problems.join('\n  ')}`)
      return
    }

    throw new Error(`Unknown command "${command}". Use seed or verify.`)
  } finally {
    await pool.end()
  }
}

if (process.argv[1]?.endsWith('launch-corpus.ts')) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error))
    process.exit(1)
  })
}
