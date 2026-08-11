import type {
  CollectionAfterChangeHook,
  CollectionBeforeChangeHook,
  CollectionBeforeOperationHook,
  CollectionBeforeValidateHook,
} from 'payload'
import { revalidateAuthorAfterChange } from '@/features/public-revalidation/revalidate-client'
import { beforeChangeHooks } from './beforeChange'
import { beforeOperationHooks } from './beforeOperation'
import { beforeValidateHooks } from './beforeValidate'
import { logPasswordSetEmail } from './afterForgotPassword'

/**
 * All hooks for Users collection organized by lifecycle
 */
export const userCollectionHooks = {
  // Rate limiting — runs before login/forgotPassword touch credentials
  beforeOperation: beforeOperationHooks as CollectionBeforeOperationHook[],
  // Password strength — also the only stage that runs on `resetPassword`
  beforeValidate: beforeValidateHooks as CollectionBeforeValidateHook[],
  beforeChange: beforeChangeHooks as CollectionBeforeChangeHook[],
  // Profile edits refresh the cached public author page
  afterChange: [revalidateAuthorAfterChange] as CollectionAfterChangeHook[],
  // Invite / password-set emails land in the email-logs delivery log
  afterForgotPassword: [logPasswordSetEmail],
}
