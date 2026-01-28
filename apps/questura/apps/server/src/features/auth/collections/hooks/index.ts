import type { CollectionBeforeChangeHook, CollectionBeforeDeleteHook, CollectionAfterReadHook } from 'payload'
import { beforeChangeHooks } from './beforeChange'
import { beforeDeleteHook } from './beforeDelete'
import { afterReadHook } from './afterRead'

/**
 * All hooks for Users collection organized by lifecycle
 */
export const userCollectionHooks = {
  beforeChange: beforeChangeHooks as CollectionBeforeChangeHook[],
  beforeDelete: [beforeDeleteHook] as CollectionBeforeDeleteHook[],
  afterRead: [afterReadHook] as CollectionAfterReadHook[]
}
