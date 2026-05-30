import type { CollectionBeforeChangeHook } from 'payload'
import { beforeChangeHooks } from './beforeChange'

/**
 * All hooks for Users collection organized by lifecycle
 */
export const userCollectionHooks = {
  beforeChange: beforeChangeHooks as CollectionBeforeChangeHook[],
}
