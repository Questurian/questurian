import type { EditorialBlock } from '../../../types'
import { getEditorialComponentDefaultLabel } from '../constants'
import { normalizeEditorialComponentKey } from './component-key'
import { validateEditorialBlockForPublish } from './publishing/validate-editorial-block'

export type RepairEditorialBlockResult =
  | {
      status: 'updated'
      editorialBlocks: EditorialBlock[]
    }
  | {
      status: 'unsupported'
      component: string
    }

export function repairEditorialBlock(
  editorialBlocks: EditorialBlock[],
  blockId: string
): RepairEditorialBlockResult | null {
  const target = editorialBlocks.find((block) => block.id === blockId)
  if (!target) return null

  const validation = validateEditorialBlockForPublish(target)
  if (validation.status === 'unsupported') {
    return { status: 'unsupported', component: target.component }
  }

  const startMatch = validation.correctedMarkdown.match(
    /\[!EDITORIAL-BLOCK-START\|([^\]]+)\]/i
  )
  const labelMatch = validation.correctedMarkdown.match(
    /\[!EDITORIAL-BLOCK-LABEL\|([^\]]+)\]/i
  )
  const correctedComponent = startMatch
    ? normalizeEditorialComponentKey(startMatch[1])
    : normalizeEditorialComponentKey(target.component)
  const defaultLabel = getEditorialComponentDefaultLabel(correctedComponent)
  const correctedLabel = labelMatch?.[1]?.trim() || target.label || defaultLabel

  return {
    status: 'updated',
    editorialBlocks: editorialBlocks.map((block) =>
      block.id === blockId
        ? {
            ...block,
            component: correctedComponent,
            label: correctedLabel,
            markdown: validation.correctedMarkdown
          }
        : block
    )
  }
}

export function replaceEditorialBlockMarkdown(
  editorialBlocks: EditorialBlock[],
  blockId: string,
  nextMarkdown: string
): EditorialBlock[] {
  return editorialBlocks.map((block) => {
    if (block.id !== blockId) return block

    const startMatch = nextMarkdown.match(
      /^\s*>\s*\[!EDITORIAL-BLOCK-START\|([^\]]+)\]\s*$/im
    )
    const labelMatch = nextMarkdown.match(
      /^\s*>\s*\[!EDITORIAL-BLOCK-LABEL\|([^\]]+)\]\s*$/im
    )

    return {
      ...block,
      component: startMatch
        ? normalizeEditorialComponentKey(startMatch[1]) || block.component
        : block.component,
      label: labelMatch?.[1]?.trim() || block.label,
      markdown: nextMarkdown
    }
  })
}
