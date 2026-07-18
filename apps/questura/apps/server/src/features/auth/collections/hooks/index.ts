import type { CollectionAfterChangeHook, CollectionBeforeChangeHook } from 'payload'
import { revalidateAuthorAfterChange } from '@/features/public-revalidation/revalidate-client'
import { beforeChangeHooks } from './beforeChange'
import { logPasswordSetEmail } from './afterForgotPassword'

/**
 * All hooks for Users collection organized by lifecycle
 */
export const userCollectionHooks = {
  beforeChange: beforeChangeHooks as CollectionBeforeChangeHook[],
  // Profile edits refresh the cached public author page
  afterChange: [revalidateAuthorAfterChange] as CollectionAfterChangeHook[],
  // Invite / password-set emails land in the email-logs delivery log
  afterForgotPassword: [logPasswordSetEmail],
}
