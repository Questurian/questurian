import type { ReactNode } from 'react'
import { useCallback, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DraggableAttributes,
  type DragEndEvent,
  type DragStartEvent
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'

import type { SlotValue } from './useHomepageFeaturedSlots'

type CuratedSlotValue = {
  title?: string | null
  imageUrl?: string | null
  coverImageUrl?: string | null
} | null

export function swapCuratedSlots<T>(slots: T[], from: number, to: number): T[] {
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < 0 ||
    from >= slots.length ||
    to >= slots.length ||
    from === to
  ) {
    return slots
  }

  const next = [...slots]
  const tmp = next[from]
  next[from] = next[to]
  next[to] = tmp
  return next
}

export function swapCuratedArticleSlots(
  slots: SlotValue[],
  from: number,
  to: number
): SlotValue[] {
  return swapCuratedSlots(slots, from, to)
}

function GripIcon() {
  return (
    <svg
      width="10"
      height="15"
      viewBox="0 0 10 15"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="2" cy="2.5" r="1.5" />
      <circle cx="8" cy="2.5" r="1.5" />
      <circle cx="2" cy="7.5" r="1.5" />
      <circle cx="8" cy="7.5" r="1.5" />
      <circle cx="2" cy="12.5" r="1.5" />
      <circle cx="8" cy="12.5" r="1.5" />
    </svg>
  )
}

type SlotSwapProviderProps<T extends CuratedSlotValue> = {
  slots: T[]
  onReorder: (newSlots: T[]) => void
  children: ReactNode
}

export function CuratedSlotSwapProvider<T extends CuratedSlotValue>({
  slots,
  onReorder,
  children
}: SlotSwapProviderProps<T>) {
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id))
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveId(null)
    if (!over || active.id === over.id) return

    const next = swapCuratedSlots(slots, Number(active.id), Number(over.id))
    if (next === slots) return
    onReorder(next)
  }

  const activeSlot =
    activeId !== null ? (slots[Number(activeId)] ?? null) : null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {children}
      <DragOverlay dropAnimation={null}>
        {activeId !== null ? (
          <CuratedArticleDragGhost item={activeSlot} />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

export const CuratedArticleSlotSwapProvider = CuratedSlotSwapProvider

type SlotSwapWrapProps = {
  slotIndex: number
  children: ReactNode
}

export function CuratedSlotSwapWrap({
  slotIndex,
  children
}: SlotSwapWrapProps) {
  const slotId = String(slotIndex)
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging
  } = useDraggable({ id: slotId })
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: slotId })

  const setRef = useCallback(
    (el: HTMLDivElement | null) => {
      setDragRef(el)
      setDropRef(el)
    },
    [setDragRef, setDropRef]
  )

  return (
    <div
      ref={setRef}
      className={[
        'hf-curated-article-slot-wrap',
        isDragging ? 'hf-curated-article-slot-wrap--dragging' : '',
        isOver ? 'hf-curated-article-slot-wrap--over' : ''
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <button
        type="button"
        className="hf-curated-article-slot-drag-handle"
        aria-label={`Drag slot ${slotIndex + 1} to swap`}
        {...(attributes as DraggableAttributes)}
        {...listeners}
      >
        <GripIcon />
      </button>
      {children}
    </div>
  )
}

export const CuratedArticleSlotSwapWrap = CuratedSlotSwapWrap

function CuratedArticleDragGhost({ item }: { item: CuratedSlotValue }) {
  const imageUrl = item?.imageUrl ?? item?.coverImageUrl ?? null

  return (
    <div className="hf-curated-article-slot-drag-ghost">
      {imageUrl ? (
        <img src={imageUrl} alt="" />
      ) : (
        <div className="hf-curated-article-slot-drag-ghost-placeholder" />
      )}
      <span className="hf-curated-article-slot-drag-ghost-title">
        {item?.title ?? 'Empty slot'}
      </span>
    </div>
  )
}
