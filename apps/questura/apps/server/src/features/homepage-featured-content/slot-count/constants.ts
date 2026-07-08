import { curatedBlockRegistry } from '../block-registry'

/**
 * Canonical min/max slot counts per block type. Used to fix stale `slotCount` after block-type
 * changes (Payload may keep the previous type’s value).
 */
export const HOMEPAGE_BLOCK_SLOT_LIMITS = Object.fromEntries(
  curatedBlockRegistry.definitions.map((definition) => [
    definition.blockType,
    {
      min: definition.slotCounts.min,
      max: definition.slotCounts.max,
    },
  ]),
) as Record<string, { min: number; max: number }>

export type HomepageBlockSlotTyped = keyof typeof HOMEPAGE_BLOCK_SLOT_LIMITS
