import type {
  CollectionAfterChangeHook,
  CollectionBeforeChangeHook,
  CollectionBeforeLoginHook,
  CollectionBeforeOperationHook,
  CollectionBeforeValidateHook,
} from 'payload'
import { revalidateAuthorAfterChange } from '@/features/public-revalidation/revalidate-client'
import { revokeSessionsOnDisableHook } from './afterChange/revokeSessionsOnDisable'
import { beforeChangeHooks } from './beforeChange'
import { beforeLoginHooks } from './beforeLogin'
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
  // Disabled accounts are refused a token — runs after the password check,
  // before the token is signed
  beforeLogin: beforeLoginHooks as CollectionBeforeLoginHook[],
  // Session revocation is ordered first: it is the security-carrying half of
  // disabling an account, and revalidation is best-effort cache maintenance
  afterChange: [
    revokeSessionsOnDisableHook,
    // Profile edits refresh the cached public author page
    revalidateAuthorAfterChange,
  ] as CollectionAfterChangeHook[],
  // Invite / password-set emails land in the email-logs delivery log
  afterForgotPassword: [logPasswordSetEmail],
}
