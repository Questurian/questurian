import { describe, expect, it } from 'vitest'
import type { CollectionConfig } from 'payload'

import { Locations } from '@/features/location/collections/Locations'
import { Dining } from '@/features/data/dining/collections/Dining'
import { Accommodations } from '@/features/data/accommodations/collections/Accommodations'
import { Attractions } from '@/features/data/attractions/collections/Attractions'
import { Nightlife } from '@/features/data/nightlife/collections/Nightlife'
import { KeyLocations } from '@/features/data/key-locations/collections/KeyLocations'
import { Tours } from '@/features/data/tours/collections/Tours'
import { InstagramPosts } from '@/features/data/instagram/collections/InstagramPosts'
import { AffiliateProducts } from '@/features/data/affiliate/collections/AffiliateProducts'
import { MediaSet } from '@/features/media/collections/MediaSet'
import { MediaAsset } from '@/features/media/collections/MediaAsset'
import { Places } from '@/features/places/collections/Places'
import { LOCATION_MANAGER_SERVICE_ACCOUNT } from './service-account-grants'

type Operation = 'read' | 'create' | 'update' | 'delete'
type AccessFunction = (args: unknown) => unknown

const locationManager = {
  id: 1,
  collection: 'service-accounts',
  name: LOCATION_MANAGER_SERVICE_ACCOUNT,
}

const collectionAccess = (collection: CollectionConfig): Record<Operation, AccessFunction> =>
  collection.access as Record<Operation, AccessFunction>

const allowed: Array<[CollectionConfig, Operation[]]> = [
  [Locations, ['read', 'create']],
  [Dining, ['read', 'create', 'update']],
  [Accommodations, ['read', 'create', 'update']],
  [Attractions, ['read', 'create', 'update']],
  [Nightlife, ['read', 'create', 'update']],
  [KeyLocations, ['read', 'create', 'update']],
  [Tours, ['read', 'create', 'update']],
  [MediaAsset, ['read', 'create', 'update']],
  [MediaSet, ['read', 'create', 'update']],
  [InstagramPosts, ['read', 'create']],
]

const invoke = async (collection: CollectionConfig, operation: Operation, user = locationManager) =>
  collectionAccess(collection)[operation]({ req: { user } })

describe('Location Manager collection access', () => {
  it('allows the complete sync matrix through collection access', async () => {
    for (const [collection, operations] of allowed) {
      for (const operation of operations) {
        await expect(
          invoke(collection, operation),
          `${collection.slug}:${operation}`,
        ).resolves.toBe(true)
      }
    }
  })

  it('denies delete on every synced collection', async () => {
    for (const [collection] of allowed) {
      await expect(invoke(collection, 'delete'), `${collection.slug}:delete`).resolves.toBe(false)
    }
  })

  it('denies ungranted authenticated reads instead of exposing drafts', async () => {
    await expect(invoke(AffiliateProducts, 'read')).resolves.toBe(false)
    await expect(invoke(Places, 'read')).resolves.toBe(false)
  })

  it('defaults an unknown service account to no private access', async () => {
    const unknown = { ...locationManager, name: 'Unknown integration' }

    for (const [collection, operations] of allowed) {
      for (const operation of operations) {
        // Locations is public by design; only its create grant is private.
        if (collection === Locations && operation === 'read') continue

        await expect(
          invoke(collection, operation, unknown),
          `${collection.slug}:${operation}`,
        ).resolves.toBe(false)
      }
    }
  })
})
