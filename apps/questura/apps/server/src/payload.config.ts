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
import { EmailLogs } from './features/emails/collections/EmailLogs'
import { MediaAsset } from './features/media/collections/MediaAsset'
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
import { APP_CONFIG, APP_URLS } from './shared/config'
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
  collections: [Users, EmailLogs, VisitorProfiles, MediaAsset, MediaSet, Articles, SingleTypeListicles, ListicleItineraries, ArticleRedirects, Locations, Categories, Tags, Accommodations, Dining, Attractions, Tours, Nightlife, KeyLocations, AffiliateProducts, InstagramPosts, PerfectForTags, Currencies, LocationHomepages],
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
      max: 20, // Maximum number of connections in the pool
      min: 2, // Minimum number of connections to keep open
      idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
      connectionTimeoutMillis: 10000, // Fail fast instead of hanging forever
    },
  }),
  email: resendAdapter({
    defaultFromAddress: 'you@questurian.com',
    defaultFromName: 'Questurian',
    apiKey: APP_CONFIG.email.apiKey,
  }),
  sharp: sharp as any,
  onInit: async () => {
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
          prefix: 'media',
        },
      },
      storage: {
        apiKey: process.env.BUNNY_STORAGE_API_KEY || '',
        hostname: process.env.BUNNY_STORAGE_HOSTNAME || '',
        zoneName: process.env.BUNNY_STORAGE_ZONE_NAME || '',
        region: 'ny',
      },
    }),
  ],
})
