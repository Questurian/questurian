import type { CollectionBeforeValidateHook } from 'payload'
import { passwordStrengthHook } from './passwordStrength'

/**
 * All beforeValidate hooks for Users collection.
 *
 * This lifecycle stage is used rather than beforeChange because it is the only
 * one Payload runs on the `resetPassword` path as well as create/update.
 */
export const beforeValidateHooks: CollectionBeforeValidateHook[] = [passwordStrengthHook]
