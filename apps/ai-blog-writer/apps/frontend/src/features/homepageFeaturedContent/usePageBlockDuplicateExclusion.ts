import { useEffect, useMemo } from 'react'
import type { UseHomepageFeaturedSlotsResult } from './useHomepageFeaturedSlots'

type Params = {
  blockId: string
  slotEditorState: UseHomepageFeaturedSlotsResult
  externalUsedKeys?: Set<string>
  onSlotsChange?: (blockId: string, keys: Set<string>) => void
}

export function usePageBlockDuplicateExclusion({
  blockId,
  slotEditorState,
  externalUsedKeys,
  onSlotsChange,
}: Params): UseHomepageFeaturedSlotsResult {
  useEffect(() => {
    onSlotsChange?.(blockId, slotEditorState.usedKeys)
    return () => {
      onSlotsChange?.(blockId, new Set())
    }
  }, [blockId, slotEditorState.usedKeys, onSlotsChange])

  const mergedUsedKeys = useMemo<UseHomepageFeaturedSlotsResult['usedKeys']>(
    () =>
      externalUsedKeys && externalUsedKeys.size > 0
        ? new Set([...slotEditorState.usedKeys, ...externalUsedKeys])
        : slotEditorState.usedKeys,
    [slotEditorState.usedKeys, externalUsedKeys],
  )

  const hasCrossBlockDuplicate =
    externalUsedKeys != null &&
    externalUsedKeys.size > 0 &&
    slotEditorState.slots.some(
      (slot) => slot != null && externalUsedKeys.has(`${slot.relationTo}:${slot.id}`),
    )

  return hasCrossBlockDuplicate || mergedUsedKeys !== slotEditorState.usedKeys
    ? {
        ...slotEditorState,
        usedKeys: mergedUsedKeys,
        saveDisabled: slotEditorState.saveDisabled || hasCrossBlockDuplicate,
      }
    : slotEditorState
}
