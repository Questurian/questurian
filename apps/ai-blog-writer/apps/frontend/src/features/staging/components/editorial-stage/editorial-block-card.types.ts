import type { EditorialBlock } from '../../types'
import type { EditorialPublishValidation } from '../../features/editorial-stage-article/editorial-markdown.service'

export type EditorialBlockCardOptions = {
  validation?: EditorialPublishValidation
  onFixBlock?: () => void
  disableFix?: boolean
  canEdit?: boolean
  onToggleEdit?: () => void
  disableEditToggle?: boolean
  onChangeMarkdown?: (nextMarkdown: string) => void
  onRemoveBlock?: () => void
  disableRemove?: boolean
  canReorder?: boolean
  onMoveUp?: () => void
  onMoveDown?: () => void
  disableMoveUp?: boolean
  disableMoveDown?: boolean
}

export type EditorialBlockCardProps = {
  block: EditorialBlock
  displayNumber: number
  options?: EditorialBlockCardOptions
}
