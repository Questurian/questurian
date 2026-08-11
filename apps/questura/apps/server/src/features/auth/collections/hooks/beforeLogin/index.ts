import type { CollectionBeforeLoginHook } from 'payload'
import { rejectDisabledLoginHook } from './rejectDisabled'

/**
 * All beforeLogin hooks for Users collection
 */
export const beforeLoginHooks: CollectionBeforeLoginHook[] = [rejectDisabledLoginHook]
