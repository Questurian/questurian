import type { PayloadInstance } from '@/types'

import type { RawBlock } from '../types'

import { curatedBlockApiPayload } from '../lib/curated-block-api-payload'
import { getHotelGridSelectionFromItems } from '../../hotel-grid/service'
import { getLocationGridSelectionFromItems } from '../../location-grid/service'
import { getQuesturianMapsSelectionFromItems } from '../../questurian-maps/service'
import {
  getHomepageFeaturedSelectionFromItems,
  getNewsletterSignupPlaceholderSelection,
} from '../../featured-articles/service'
import { resolveStoredSlotCountForBlockType } from '../../slot-count/service'
import { getThingsToDoAttractionsSelectionFromItems } from '../../things-to-do-attractions/service'
import { getThingsToDoListiclesSelectionFromItems } from '../../things-to-do-listicles/service'
import { getTourGridSelectionFromItems } from '../../tour-grid/service'
import { getWhereToEatDrinkSelectionFromItems } from '../../where-to-eat-drink/service'
import { isCuratedBlockType } from '../lib/guards'
import { resolveLocationGridScope } from './resolve-scope'

export async function resolvePageBlocks(
  payload: PayloadInstance,
  rawBlocks: RawBlock[],
  locationGridScope: Awaited<ReturnType<typeof resolveLocationGridScope>>,
) {
  return Promise.all(
    rawBlocks.map(async (block) => {
      if (isCuratedBlockType(block.blockType)) {
        const slotCount = resolveStoredSlotCountForBlockType(block.blockType, block.slotCount)
        const selection =
          block.blockType === 'location-grid'
            ? await getLocationGridSelectionFromItems(payload, block.items, {
                totalSlots: slotCount,
                scope: locationGridScope,
              })
            : block.blockType === 'questurian-maps'
              ? await getQuesturianMapsSelectionFromItems(payload, block.items, {
                  totalSlots: slotCount,
                })
              : block.blockType === 'hotel-grid'
                ? await getHotelGridSelectionFromItems(payload, block.items, {
                    totalSlots: slotCount,
                  })
                : block.blockType === 'tour-grid'
                  ? await getTourGridSelectionFromItems(payload, block.items, {
                      totalSlots: slotCount,
                    })
                  : block.blockType === 'where-to-eat-drink'
                    ? await getWhereToEatDrinkSelectionFromItems(payload, block.items, {
                        totalSlots: slotCount,
                      })
                    : block.blockType === 'things-to-do-listicles'
                      ? await getThingsToDoListiclesSelectionFromItems(payload, block.items, {
                          totalSlots: slotCount,
                        })
                      : block.blockType === 'things-to-do-attractions'
                        ? await getThingsToDoAttractionsSelectionFromItems(payload, block.items, {
                            totalSlots: slotCount,
                          })
                        : block.blockType === 'newsletter-signup'
                          ? getNewsletterSignupPlaceholderSelection()
                          : await getHomepageFeaturedSelectionFromItems(payload, block.items, {
                              totalSlots: slotCount,
                            })
        return curatedBlockApiPayload(block, selection)
      }

      return block
    }),
  )
}
