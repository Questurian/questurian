import type { ReactNode } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

type Props<T extends { id: string }> = {
  blocks: T[]
  disabled?: boolean
  children: (block: T, index: number) => ReactNode
  onReorder: (orderedIds: string[]) => void
}

export default function HomepageBlocksSortableList<T extends { id: string }>({
  blocks,
  disabled,
  children,
  onReorder,
}: Props<T>) {
  const ids = blocks.map((b) => b.id)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (disabled || !over || active.id === over.id) return
    const oldIndex = ids.indexOf(String(active.id))
    const newIndex = ids.indexOf(String(over.id))
    if (oldIndex === -1 || newIndex === -1) return
    onReorder(arrayMove(ids, oldIndex, newIndex))
  }

  if (ids.length === 0) return null

  if (ids.length < 2) {
    return (
      <>
        {blocks.map((block, idx) => (
          <div key={block.id}>{children(block, idx)}</div>
        ))}
      </>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {blocks.map((block, idx) => (
          <SortableBlockItem key={block.id} id={block.id} disabled={disabled}>
            {children(block, idx)}
          </SortableBlockItem>
        ))}
      </SortableContext>
    </DndContext>
  )
}

function SortableBlockItem({
  id,
  disabled,
  children,
}: {
  id: string
  disabled?: boolean
  children: ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.92 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={isDragging ? 'hf-sortable-block hf-sortable-block--dragging' : 'hf-sortable-block'}
    >
      <button
        type="button"
        className="hf-block-drag-handle"
        aria-label="Drag to reorder block"
        disabled={disabled}
        {...attributes}
        {...listeners}
      >
        <span className="hf-block-drag-handle-grip" aria-hidden />
      </button>
      <div className="hf-sortable-block-main">{children}</div>
    </div>
  )
}
