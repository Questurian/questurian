import { getBlockTypeForListicleType } from '../../api'
import type { SingleTypeListicleDraft } from '../../types'
import { validateStep1 } from './setup.validators'

export function validateSubmit(
  draft: SingleTypeListicleDraft,
  selectedLocationRefId: number | null,
  targetStatus: 'draft' | 'published',
): string | null {
  const stepIssues = validateStep1(draft)
  if (stepIssues.length > 0) return stepIssues.join('. ')

  if (draft.items.length > draft.targetItemCount) {
    return `This list has ${draft.items.length} items, but target size is ${draft.targetItemCount}`
  }

  if (targetStatus === 'published' && draft.items.length !== draft.targetItemCount) {
    return `Publishing requires exactly ${draft.targetItemCount} items. Current item count is ${draft.items.length}`
  }

  if (!draft.listicleType) return 'Listicle type is required'

  const expectedBlockType = getBlockTypeForListicleType(draft.listicleType)
  if (draft.items.some((item) => item.blockType !== expectedBlockType)) {
    return 'Item block types do not match selected listicle type'
  }

  if (!selectedLocationRefId) return 'Select a valid location'

  return null
}
