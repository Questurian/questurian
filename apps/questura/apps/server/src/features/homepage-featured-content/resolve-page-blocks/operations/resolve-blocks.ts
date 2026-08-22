import type { PayloadInstance } from '@/types'

import type { RawBlock } from '../types'

import { curatedBlockRegistry } from '../../block-registry'
import { resolveStoredSlotCountForBlockType } from '../../slot-count/service'
import { curatedBlockApiPayload } from '../lib/curated-block-api-payload'
import { resolveLocationGridScope } from './resolve-scope'

export async function resolvePageBlocks(
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
