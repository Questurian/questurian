import { describe, expect, it } from 'vitest'

import {
  LOCATION_MANAGER_SERVICE_ACCOUNT,
  serviceAccountHasCapability,
  serviceAccountHasCollectionGrant,
  type ServiceAccountCollectionOperation,
} from './service-account-grants'

const locationManager = {
  id: 1,
  collection: 'service-accounts',
  name: LOCATION_MANAGER_SERVICE_ACCOUNT,
} as const

const allowed: Record<string, ServiceAccountCollectionOperation[]> = {
  locations: ['create'],
  dining: ['read', 'create', 'update'],
  accommodations: ['read', 'create', 'update'],
  attractions: ['read', 'create', 'update'],
  nightlife: ['read', 'create', 'update'],
  'key-locations': ['read', 'create', 'update'],
  tours: ['read', 'create', 'update'],
  'media-assets': ['read', 'create', 'update'],
  'media-sets': ['read', 'create', 'update'],
  'instagram-posts': ['read', 'create'],
}

describe('service-account collection grants', () => {
  it('grants Location Manager only its sync operations', () => {
    for (const [collection, operations] of Object.entries(allowed)) {
      for (const operation of operations) {
        expect(
          serviceAccountHasCollectionGrant(
            locationManager as never,
            collection as never,
            operation,
          ),
          `${collection}:${operation}`,
        ).toBe(true)
      }
    }
  })

  it('denies every delete plus unrelated sensitive collections', () => {
    for (const collection of Object.keys(allowed)) {
      expect(
        serviceAccountHasCollectionGrant(locationManager as never, collection as never, 'delete'),
        `${collection}:delete`,
      ).toBe(false)
    }

    for (const collection of ['users', 'service-accounts', 'affiliate-products', 'places']) {
      for (const operation of ['read', 'create', 'update', 'delete'] as const) {
        expect(
          serviceAccountHasCollectionGrant(
            locationManager as never,
            collection as never,
            operation,
          ),
          `${collection}:${operation}`,
        ).toBe(false)
      }
    }
  })

  it('defaults unknown machines and human staff to no machine grants', () => {
    const unknownMachine = { ...locationManager, name: 'Unknown integration' }
    const humanAdmin = { id: 2, collection: 'users', role: 'admin', status: 'active' }

    expect(serviceAccountHasCollectionGrant(unknownMachine as never, 'locations', 'create')).toBe(
      false,
    )
    expect(serviceAccountHasCollectionGrant(humanAdmin as never, 'locations', 'create')).toBe(false)
  })
})

describe('service-account route capabilities', () => {
  it('grants Location Manager source-media assembly', () => {
    expect(serviceAccountHasCapability(locationManager as never, 'media-sets:from-source')).toBe(
      true,
    )
  })

  it('defaults other machines and human staff to no route capabilities', () => {
    const unknownMachine = { ...locationManager, name: 'Unknown integration' }
    const humanAdmin = { id: 2, collection: 'users', role: 'admin', status: 'active' }

    expect(serviceAccountHasCapability(unknownMachine as never, 'media-sets:from-source')).toBe(
      false,
    )
    expect(serviceAccountHasCapability(humanAdmin as never, 'media-sets:from-source')).toBe(false)
  })
})
