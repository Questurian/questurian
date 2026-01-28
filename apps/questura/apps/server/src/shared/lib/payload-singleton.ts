import { getPayload as getPayloadOriginal, Payload } from 'payload'
import config from '@/payload.config'

/**
 * Payload singleton to prevent duplicate instances and connection pool leaks in development.
 *
 * In Next.js dev mode with HMR, each module reload can create new Payload instances,
 * which creates duplicate database connection pools. This leads to connection exhaustion.
 *
 * This singleton caches the Payload instance globally in development mode only.
 */

let cachedPayload: Payload | null = null

export async function getPayload(): Promise<Payload> {
  // In development, use cached instance to prevent connection pool duplication
  if (process.env.NODE_ENV === 'development') {
    if (cachedPayload) {
      return cachedPayload
    }

    cachedPayload = await getPayloadOriginal({ config })
    return cachedPayload
  }

  // In production, always create fresh instance (handled by Payload internally)
  return getPayloadOriginal({ config })
}
