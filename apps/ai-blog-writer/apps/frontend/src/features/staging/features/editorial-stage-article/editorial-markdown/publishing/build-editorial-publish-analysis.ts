import type { EditorialBlock } from '../../../../types'
import type {
  EditorialPublishAnalysis,
  EditorialPublishValidation,
} from './editorial-publish.types'
import { validateEditorialBlockForPublish } from './validate-editorial-block'

export function buildEditorialPublishAnalysis(
  editorialBlocks: EditorialBlock[]
): EditorialPublishAnalysis {
  const byId: Record<string, EditorialPublishValidation> = {}
  const blockingBlocks: Array<{ blockId: string; message: string }> = []

  editorialBlocks.forEach((block) => {
    const validation = validateEditorialBlockForPublish(block)
    byId[block.id] = validation

    if (validation.status !== 'supported') {
      blockingBlocks.push({
        blockId: block.id,
        message: `${block.label}: ${validation.message}`,
      })
    }
  })

  return {
    byId,
    blockingBlocks,
    hasBlockingBlocks: blockingBlocks.length > 0,
  }
}
