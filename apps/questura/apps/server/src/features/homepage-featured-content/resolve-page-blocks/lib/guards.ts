import type { CuratedBlockType } from '../types'

import { curatedBlockRegistry } from '../../block-registry'

/**
 * Whether `value` is a registered curated block type. Membership is answered by the
 * registry (the single source of truth); the `CuratedBlockType` union is the compile-time
 * mirror used to narrow downstream.
 */
export function isCuratedBlockType(value: unknown): value is CuratedBlockType {
  return curatedBlockRegistry.has(value)
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
