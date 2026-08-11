import type { CollectionSlug, PayloadRequest } from 'payload'

import type { ServiceAccount } from '@/payload-types'

export const LOCATION_MANAGER_SERVICE_ACCOUNT = 'Location Manager'

export type ServiceAccountCollectionOperation = 'read' | 'create' | 'update' | 'delete'

type CollectionGrants = Partial<
  Record<CollectionSlug, readonly ServiceAccountCollectionOperation[]>
>

const SERVICE_ACCOUNT_COLLECTION_GRANTS: Record<string, CollectionGrants> = {
  [LOCATION_MANAGER_SERVICE_ACCOUNT]: {
    locations: ['create'],
    dining: ['read', 'create', 'update'],
    accommodations: ['read', 'create', 'update'],
    attractions: ['read', 'create', 'update'],
    nightlife: ['read', 'create', 'update'],
    'key-locations': ['read', 'create', 'update'],
    tours: ['read', 'create', 'update'],
    'media-assets': ['read', 'create', 'update'],
    'media-sets': ['read', 'create', 'update'],
    // Gallery merges populate existing Instagram relationships before an
    // upsert. Without read access Payload strips them and the next update
    // silently drops the existing gallery.
    'instagram-posts': ['read', 'create'],
  },
}

function serviceAccount(user: PayloadRequest['user']): ServiceAccount | null {
  if (!user || user.collection !== 'service-accounts') return null
  return user as ServiceAccount
}

/**
 * One default-deny grant table for machine collection access (ADR-0006).
 * `name` is currently the only unique, environment-independent identity on
 * ServiceAccounts. Renaming an account therefore fails closed until its grant
 * entry is updated.
 */
export function serviceAccountHasCollectionGrant(
  user: PayloadRequest['user'],
  collection: CollectionSlug,
  operation: ServiceAccountCollectionOperation,
): boolean {
  const account = serviceAccount(user)
  if (!account) return false

  return SERVICE_ACCOUNT_COLLECTION_GRANTS[account.name]?.[collection]?.includes(operation) ?? false
}
