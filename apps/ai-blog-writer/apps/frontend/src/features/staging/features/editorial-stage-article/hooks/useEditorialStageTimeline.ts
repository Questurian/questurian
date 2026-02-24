import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react'
import type { StagedArticle } from '../../../types'
import {
  applyTimelineItemsToDraft,
  buildTimelineItems,
  type TimelineItem,
} from '../workflow.service'

type UseEditorialStageTimelineParams = {
  stagedArticle: StagedArticle | null
  updateStagedArticle: (updates: Partial<StagedArticle>) => void
}

export function useEditorialStageTimeline({
  stagedArticle,
  updateStagedArticle,
}: UseEditorialStageTimelineParams) {
  const [activeEditingTimelineItemId, setActiveEditingTimelineItemId] = useState<string | null>(null)
  const [draggedTimelineItemId, setDraggedTimelineItemId] = useState<string | null>(null)
  const [dragOverTimelineItemId, setDragOverTimelineItemId] = useState<string | null>(null)

  const timelineItems = useMemo(
    () => buildTimelineItems(stagedArticle?.blocks || [], stagedArticle?.editorialBlocks || []),
    [stagedArticle?.blocks, stagedArticle?.editorialBlocks]
  )

  useEffect(() => {
    if (!activeEditingTimelineItemId) return
    const stillExists = timelineItems.some((item) => item.id === activeEditingTimelineItemId)
    if (!stillExists) {
      setActiveEditingTimelineItemId(null)
    }
  }, [timelineItems, activeEditingTimelineItemId])

  useEffect(() => {
    if (!stagedArticle?.publishedToPayload) return
    if (!activeEditingTimelineItemId) return
    setActiveEditingTimelineItemId(null)
  }, [stagedArticle?.publishedToPayload, activeEditingTimelineItemId])

  const toggleTimelineItemEdit = useCallback((timelineItemId: string) => {
    setActiveEditingTimelineItemId((current) => (
      current === timelineItemId ? null : timelineItemId
    ))
  }, [])

  const applyTimelineReorder = useCallback((nextTimelineItems: TimelineItem[]) => {
    if (!stagedArticle) return

    const reordered = applyTimelineItemsToDraft(
      nextTimelineItems,
      stagedArticle.blocks,
      stagedArticle.editorialBlocks
    )

    updateStagedArticle({
      blocks: reordered.blocks,
      editorialBlocks: reordered.editorialBlocks,
      lexicalConverted: false,
    })
  }, [stagedArticle, updateStagedArticle])

  const moveTimelineItem = useCallback((
    timelineItemId: string,
    direction: 'up' | 'down'
  ) => {
    if (!stagedArticle) return
    const currentIndex = timelineItems.findIndex((item) => item.id === timelineItemId)
    if (currentIndex === -1) return

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    if (targetIndex < 0 || targetIndex >= timelineItems.length) return

    const reorderedTimeline = [...timelineItems]
    const [movedItem] = reorderedTimeline.splice(currentIndex, 1)
    reorderedTimeline.splice(targetIndex, 0, movedItem)
    applyTimelineReorder(reorderedTimeline)
  }, [stagedArticle, timelineItems, applyTimelineReorder])

  const handleDragStart = useCallback((e: DragEvent, timelineItemId: string) => {
    setDraggedTimelineItemId(timelineItemId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', timelineItemId)
    setTimeout(() => {
      const element = document.querySelector(`[data-timeline-id="${timelineItemId}"]`)
      if (element) {
        element.classList.add('dragging')
      }
    }, 0)
  }, [])

  const handleDragEnd = useCallback(() => {
    setDraggedTimelineItemId(null)
    setDragOverTimelineItemId(null)
    document.querySelectorAll('.block-editor-item').forEach((element) => {
      element.classList.remove('dragging')
    })
  }, [])

  const handleDragOver = useCallback((e: DragEvent, timelineItemId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (timelineItemId !== draggedTimelineItemId) {
      setDragOverTimelineItemId(timelineItemId)
    }
  }, [draggedTimelineItemId])

  const handleDragLeave = useCallback(() => {
    setDragOverTimelineItemId(null)
  }, [])

  const handleDrop = useCallback((e: DragEvent, targetTimelineItemId: string) => {
    e.preventDefault()
    if (!stagedArticle || !draggedTimelineItemId || draggedTimelineItemId === targetTimelineItemId) {
      setDraggedTimelineItemId(null)
      setDragOverTimelineItemId(null)
      return
    }

    const reorderedTimeline = [...timelineItems]
    const draggedIndex = reorderedTimeline.findIndex((item) => item.id === draggedTimelineItemId)
    const targetIndex = reorderedTimeline.findIndex((item) => item.id === targetTimelineItemId)

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedTimelineItemId(null)
      setDragOverTimelineItemId(null)
      return
    }

    const [draggedItem] = reorderedTimeline.splice(draggedIndex, 1)
    const newTargetIndex = draggedIndex < targetIndex ? targetIndex - 1 : targetIndex
    reorderedTimeline.splice(newTargetIndex, 0, draggedItem)

    applyTimelineReorder(reorderedTimeline)
    setDraggedTimelineItemId(null)
    setDragOverTimelineItemId(null)
  }, [stagedArticle, draggedTimelineItemId, timelineItems, applyTimelineReorder])

  return {
    activeEditingTimelineItemId,
    setActiveEditingTimelineItemId,
    timelineItems,
    toggleTimelineItemEdit,
    moveTimelineItem,
    draggedTimelineItemId,
    dragOverTimelineItemId,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  }
}
