import { postgresAdapter } from '@payloadcms/db-postgres'
import { resendAdapter } from '@payloadcms/email-resend'
import { payloadCloudPlugin } from '@payloadcms/payload-cloud'
import { bunnyStorage } from '@seshuk/payload-storage-bunny'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Users } from './features/auth/collections/Users'
import { Authors } from './features/authors/collections/Authors'
import { ServiceAccounts } from './features/auth/collections/ServiceAccounts'
import { EmailLogs } from './features/emails/collections/EmailLogs'
import { MediaAsset } from './features/media/collections/MediaAsset'
import { MEDIA_ASSETS_PREFIX } from './features/media/lib/bunny-public-url'
import { MediaSet } from './features/media/collections/MediaSet'
import { Articles } from './features/articles/articles/collections/Articles'
import { Locations } from './features/location/collections'
import { Accommodations } from './features/data/accommodations/collections/Accommodations'
import { Dining } from './features/data/dining/collections/Dining'
import { Attractions } from './features/data/attractions/collections/Attractions'
import { Tours } from './features/data/tours/collections/Tours'
import { Nightlife } from './features/data/nightlife/collections/Nightlife'
import { KeyLocations } from './features/data/key-locations/collections/KeyLocations'
import { AffiliateProducts } from './features/data/affiliate/collections/AffiliateProducts'
import { InstagramPosts } from './features/data/instagram/collections/InstagramPosts'
import { PerfectForTags } from './features/shared/perfect-for/collections/PerfectForTags'
import { Currencies } from './features/shared/currencies/collections/Currencies'
import { Categories, Tags } from './features/shared/taxonomy/collections'
import { SingleTypeListicles } from './features/articles/single-type-listicles/collections'
import { ListicleItineraries } from './features/articles/listicle-itineraries/collections'
import { ArticleRedirects } from './features/articles/redirects/collections'
import { LocationHomepages, MainHomepage } from './features/homepage-featured-content'
import { VisitorProfiles } from './features/visitor-auth'
import { Bookmarks } from './features/bookmarks'
import { StripeWebhookEvents } from './features/payments/collections/StripeWebhookEvents'
import { APP_CONFIG, APP_URLS } from './shared/config'
import { RefreshJobs } from './features/refresh-outbox/collection'
import { applicationName } from './shared/database/fleet-manifest'
import { poolSizes } from './shared/database/pool-budget'
import { anonymousApiBoundsPlugin } from './shared/payload/anonymous-api-bounds'
import { poolTimeoutOptions, servingTimeouts } from './shared/database/timeouts'
const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
    // Credentials (cookies) are handled automatically in Payload for admin requests
  },
  // For local dev, use localhost. For external services (Google, Stripe), they use ngrok via backendUrl()
  // The admin panel runs locally and should use localhost to avoid CORS issues
  serverURL: APP_URLS.backendLocal,
  cors: APP_CONFIG.CORS_ORIGINS,
  csrf: APP_CONFIG.CORS_ORIGINS,
  collections: [Users, ServiceAccounts, Authors, EmailLogs, VisitorProfiles, Bookmarks, MediaAsset, MediaSet, Articles, SingleTypeListicles, ListicleItineraries, ArticleRedirects, Locations, Categories, Tags, Accommodations, Dining, Attractions, Tours, Nightlife, KeyLocations, AffiliateProducts, InstagramPosts, PerfectForTags, Currencies, LocationHomepages, StripeWebhookEvents, RefreshJobs],
  globals: [MainHomepage],
  editor: lexicalEditor(),
  secret: APP_CONFIG.payloadSecret,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    push: false,
    pool: {
      connectionString: APP_CONFIG.database.uri,
      // Named so `pg_stat_activity` can say which pool of which release
      // opened a connection. A budget that says 41 per process cannot be
      // checked against a database that reports 300 connections all called
      // `node` (shared/database/fleet-manifest.ts).
      application_name: applicationName('payload'),
      // Sized in one place with every other pool, so the budget check adds
      // up the numbers that are actually used (shared/database/pool-budget.ts).
      max: poolSizes().payload,
      min: 2, // Minimum number of connections to keep open
      idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
      connectionTimeoutMillis: 10000, // Fail fast instead of hanging forever
      // Bounds on what a connection may do once it has one: a query with no
      // plan, a lock nobody releases, a transaction a handler left open.
      // `connectionTimeoutMillis` covers none of those, and aborting the HTTP
      // request does not stop the database. The migration scripts set
      // PG_STATEMENT_TIMEOUT_MS=0 -- see shared/database/timeouts.ts.
      ...poolTimeoutOptions(servingTimeouts()),
    },
  }),
  email: resendAdapter({
    defaultFromAddress: 'you@questurian.com',
    defaultFromName: 'Questurian',
    apiKey: APP_CONFIG.email.apiKey,
  }),
  sharp: sharp as any,
  onInit: async () => {
    // Refuse to serve production traffic with development URL defaults, which
    // would otherwise silently emit localhost OAuth redirects, Stripe return
    // URLs and password-reset links. Checked here rather than at module load so
    // `next build` (which runs with NODE_ENV=production) is unaffected. No-op
    // outside production.
    const { assertProductionConfig } = await import('./shared/config/assert-production-config')
    assertProductionConfig()

    // Better Auth owns `visitor_auth_*`; Payload owns CMS collections. Keep this
    // idempotent guard so fresh or partially migrated dev DBs still have auth DDL.
    const { ensureVisitorAuthSchema } = await import(
      './features/visitor-auth/lib/ensure-visitor-auth-schema'
    )
    await ensureVisitorAuthSchema()
  },
  plugins: [
    payloadCloudPlugin(),
    bunnyStorage({
      collections: {
        'media-assets': {
          prefix: MEDIA_ASSETS_PREFIX,
          /*
           * Hand readers the file's address on the pull zone instead of
           * Payload's own `/api/media-assets/file/{filename}`, which fetched
           * every photo out of Bunny and re-sent it through this process.
           *
           * Two things follow from the flag, both in
           * @payloadcms/plugin-cloud-storage: the `url` field's afterRead hook
           * starts calling `adapter.generateURL(...)`, so every read returns a
           * CDN URL whatever the stored column says; and `adapter.staticHandler`
           * is no longer registered, so that route stops serving files. The
           * redirect at app/api/media-assets/file/[filename] covers cached HTML
           * that still asks for it.
           *
           * Nothing is lost by bypassing Payload's access control here:
           * `mediaAssetAccess.read` already opens with `if (!req.user) return true`.
           */
          disablePayloadAccessControl: true,
        },
      },
      storage: {
        apiKey: process.env.BUNNY_STORAGE_API_KEY || '',
        hostname: process.env.BUNNY_STORAGE_HOSTNAME || '',
        zoneName: process.env.BUNNY_STORAGE_ZONE_NAME || '',
        region: 'ny',
      },
    }),
    // Last, so it sees every collection any plugin above added. Clamps and
    // rate-limits anonymous REST/GraphQL reads; see the plugin for why.
    anonymousApiBoundsPlugin,
  ],
})
