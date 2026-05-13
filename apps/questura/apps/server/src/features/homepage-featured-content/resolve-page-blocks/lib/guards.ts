import type { CuratedBlockType } from '../types'

import { CURATED_BLOCK_TYPES } from '../constants'

const CURATED_BLOCK_TYPE_SET: ReadonlySet<string> = new Set(CURATED_BLOCK_TYPES)

export function isCuratedBlockType(value: unknown): value is CuratedBlockType {
  return typeof value === 'string' && CURATED_BLOCK_TYPE_SET.has(value)
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
