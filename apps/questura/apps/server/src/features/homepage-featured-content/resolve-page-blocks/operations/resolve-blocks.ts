import type { PayloadInstance } from '@/types'

import type { RawBlock } from '../types'

import { curatedBlockRegistry } from '../../block-registry'
import {
  withPageReadBudget,
  type PageReadBudgetOptions,
  type PageReadStats,
} from '../../reference-grid/page-read-budget'
import { resolveStoredSlotCountForBlockType } from '../../slot-count/service'
import { curatedBlockApiPayload } from '../lib/curated-block-api-payload'
import { resolveLocationGridScope } from './resolve-scope'

async function resolveAll(
  payload: PayloadInstance,
  rawBlocks: RawBlock[],
  locationGridScope: Awaited<ReturnType<typeof resolveLocationGridScope>>,
) {
  return Promise.all(
    rawBlocks.map(async (block) => {
      const definition = curatedBlockRegistry.get(String(block.blockType))
      if (!definition) {
        return block
      }

      const slotCount = resolveStoredSlotCountForBlockType(block.blockType, block.slotCount)
      const selection = await definition.behavior.resolveSelection(block.items, {
        payload,
        slotCount,
        locationGridScope,
        block,
      })

      const resolvedFields = definition.behavior.resolveFields
        ? await definition.behavior.resolveFields(block, {
            payload,
            slotCount,
            locationGridScope,
            block,
          })
        : undefined

      return curatedBlockApiPayload(block, selection, resolvedFields)
    }),
  )
}

/**
 * Resolve every block on one page under one shared read budget.
 *
 * The blocks themselves have always resolved concurrently; what was missing is
 * that each one took its own six-read allowance, so the documented page-wide
 * bound was six *per block* against a 20-connection pool. `withPageReadBudget`
 * makes the six a property of the page, and dedupes references repeated across
 * blocks so a city that appears in a location grid and a featured row is read
 * once.
 */
export async function resolvePageBlocksWithReadStats(
  payload: PayloadInstance,
  rawBlocks: RawBlock[],
  locationGridScope: Awaited<ReturnType<typeof resolveLocationGridScope>>,
  budget: PageReadBudgetOptions = {},
): Promise<{ blocks: Awaited<ReturnType<typeof resolveAll>>; stats: PageReadStats }> {
  const { result, stats } = await withPageReadBudget(
    () => resolveAll(payload, rawBlocks, locationGridScope),
    budget,
  )

  return { blocks: result, stats }
}

export async function resolvePageBlocks(
  payload: PayloadInstance,
  rawBlocks: RawBlock[],
  locationGridScope: Awaited<ReturnType<typeof resolveLocationGridScope>>,
) {
  const { blocks } = await resolvePageBlocksWithReadStats(payload, rawBlocks, locationGridScope)
  return blocks
}
