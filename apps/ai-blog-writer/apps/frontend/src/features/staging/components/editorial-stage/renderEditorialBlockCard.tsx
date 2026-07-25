import type { EditorialBlock } from '../../types'
import { EditorialBlockCard } from './EditorialBlockCard'
import type { EditorialBlockCardOptions } from './editorial-block-card.types'

export function renderEditorialBlockCard(
  block: EditorialBlock,
  displayNumber: number,
  options?: EditorialBlockCardOptions,
) {
  return (
    <EditorialBlockCard
      block={block}
      displayNumber={displayNumber}
      options={options}
    />
  )
}
