import type { CollectionSlug } from 'payload'

export type ArticleLocationScope = {
  exactNeighborhoods: boolean
  keys: string[]
  refs: Array<string | number>
}

export type SharedNeighborhoodValidationInput = {
  location?: unknown
  sharedNeighborhoods?: unknown
}

export type LocationReferenceTarget = {
  slug: CollectionSlug
  label: string
  hasSharedNeighborhoods?: boolean
}

export type LocationScope = {
  keys: string[]
  refs: Array<string | number>
}

export type LocationSyncOptions = {
  locationField?: string
  locationRefField?: string
}
