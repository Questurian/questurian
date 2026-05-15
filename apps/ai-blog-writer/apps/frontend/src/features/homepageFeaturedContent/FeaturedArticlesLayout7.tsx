import type { ReactNode } from 'react'
import { useCallback, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DraggableAttributes,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'

import type { SlotValue } from './useHomepageFeaturedSlots'
import type { HomepageFeaturedInvalidItem } from './types'

function GripIcon() {
  return (
    <svg width="10" height="15" viewBox="0 0 10 15" fill="currentColor" aria-hidden="true">
      <circle cx="2" cy="2.5" r="1.5" />
      <circle cx="8" cy="2.5" r="1.5" />
      <circle cx="2" cy="7.5" r="1.5" />
      <circle cx="8" cy="7.5" r="1.5" />
      <circle cx="2" cy="12.5" r="1.5" />
      <circle cx="8" cy="12.5" r="1.5" />
    </svg>
  )
}

function ImgPlaceholder() {
  return (
    <svg
      style={{ width: '40%', height: '40%', color: 'var(--muted)', opacity: 0.4 }}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  )
}

function captionFromExcerpt(excerpt: string | null, maxLen = 96): string | null {
  if (!excerpt?.trim()) return null
  const t = excerpt.trim()
  if (t.length <= maxLen) return t
  return `${t.slice(0, maxLen - 1)}…`
}

type ConnectedSlotWrapProps = {
  slotId: string
  children: ReactNode
}

function ConnectedSlotWrap({ slotId, children }: ConnectedSlotWrapProps) {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({ id: slotId })
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: slotId })

  const setRef = useCallback(
    (el: HTMLDivElement | null) => {
      setDragRef(el)
      setDropRef(el)
    },
    [setDragRef, setDropRef],
  )

  return (
    <div
      ref={setRef}
      className={[
        'hf-l7-slot-wrap',
        isDragging ? 'hf-l7-slot-wrap--dragging' : '',
        isOver ? 'hf-l7-slot-wrap--over' : '',
      ].filter(Boolean).join(' ')}
    >
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <button
        type="button"
        className="hf-l7-drag-handle"
        aria-label="Drag to reorder"
        {...(attributes as DraggableAttributes)}
        {...(listeners as any)}
      >
        <GripIcon />
      </button>
      {children}
    </div>
  )
}

type SlotCardProps = {
  slotIndex: number
  item: SlotValue
  invalid: HomepageFeaturedInvalidItem | undefined
  onClick: () => void
}

function LeftStackCard({ slotIndex, item, invalid, onClick }: SlotCardProps) {
  const num = slotIndex + 1

  if (!item) {
    return (
      <button
        type="button"
        className={`hf-l7-left-card hf-l7-left-card--empty${invalid ? ' invalid' : ''}`}
        onClick={onClick}
      >
        <div className="hf-l7-empty">
          <span className="hf-l7-num hf-l7-num--static">{num}</span>
          {invalid ? (
            <>
              <span style={{ fontSize: '1.2rem' }}>⚠</span>
              <span style={{ fontSize: '0.8rem', color: 'var(--error)', fontWeight: 600 }}>
                {invalid.reason === 'not_published' ? 'No longer published' : 'Not found'}
              </span>
            </>
          ) : (
            <>
              <span style={{ fontSize: '1.4rem' }}>＋</span>
              <span>Add article</span>
            </>
          )}
        </div>
      </button>
    )
  }

  const cap = captionFromExcerpt(item.excerpt)

  return (
    <button type="button" className="hf-l7-left-card" onClick={onClick}>
      <div className="hf-l7-left-thumb">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt="" loading="lazy" />
        ) : (
          <div className="hf-l7-thumb-fallback">
            <ImgPlaceholder />
          </div>
        )}
        <span className="hf-l7-num">{num}</span>
      </div>
      {cap ? <p className="hf-l7-credit">{cap}</p> : <p className="hf-l7-credit hf-l7-credit--muted"> </p>}
      <p className="hf-l7-headline hf-l7-headline--left">{item.title}</p>
      <p className="hf-l7-byline">{item.authorLabel ?? '—'}</p>
    </button>
  )
}

function CenterHero({ slotIndex, item, invalid, onClick }: SlotCardProps) {
  const num = slotIndex + 1

  if (!item) {
    return (
      <button
        type="button"
        className={`hf-l7-hero hf-l7-hero--empty${invalid ? ' invalid' : ''}`}
        onClick={onClick}
      >
        <div className="hf-l7-empty hf-l7-empty--hero">
          <span className="hf-l7-num hf-l7-num--static">{num}</span>
          {invalid ? (
            <>
              <span style={{ fontSize: '1.2rem' }}>⚠</span>
              <span style={{ fontSize: '0.8rem', color: 'var(--error)', fontWeight: 600 }}>
                {invalid.reason === 'not_published' ? 'No longer published' : 'Not found'}
              </span>
            </>
          ) : (
            <>
              <span style={{ fontSize: '1.6rem' }}>＋</span>
              <span>Add lead article</span>
            </>
          )}
        </div>
      </button>
    )
  }

  const sub = item.excerpt?.trim() ?? null

  return (
    <button type="button" className="hf-l7-hero" onClick={onClick}>
      <div className="hf-l7-hero-thumb">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt="" loading="lazy" />
        ) : (
          <div className="hf-l7-thumb-fallback">
            <ImgPlaceholder />
          </div>
        )}
        <span className="hf-l7-num">{num}</span>
      </div>
      <div className="hf-l7-hero-copy">
        <p className="hf-l7-headline hf-l7-headline--hero">{item.title}</p>
        {sub ? <p className="hf-l7-dek">{sub}</p> : null}
        <p className="hf-l7-byline hf-l7-byline--center">{item.authorLabel ?? '—'}</p>
      </div>
    </button>
  )
}

function RightRow({ slotIndex, item, invalid, onClick }: SlotCardProps) {
  const num = slotIndex + 1
  const isFirst = slotIndex === 3

  if (!item) {
    return (
      <button
        type="button"
        className={`hf-l7-side-row${isFirst ? ' hf-l7-side-row--first' : ''}${invalid ? ' invalid' : ''}`}
        onClick={onClick}
      >
        <div className="hf-l7-side-body">
          <span className="hf-l7-num hf-l7-num--inline">{num}</span>
          <p className="hf-l7-headline hf-l7-headline--side hf-l7-headline--placeholder">
            {invalid
              ? invalid.reason === 'not_published'
                ? 'No longer published'
                : 'Not found'
              : '＋ Add article'}
          </p>
        </div>
        <div className="hf-l7-side-thumb hf-l7-side-thumb--empty" />
      </button>
    )
  }

  return (
    <button
      type="button"
      className={`hf-l7-side-row${isFirst ? ' hf-l7-side-row--first' : ''}`}
      onClick={onClick}
    >
      <div className="hf-l7-side-body">
        <span className="hf-l7-num hf-l7-num--inline">{num}</span>
        <p className="hf-l7-headline hf-l7-headline--side">{item.title}</p>
        <p className="hf-l7-byline">{item.authorLabel ?? '—'}</p>
      </div>
      <div className="hf-l7-side-thumb">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt="" loading="lazy" />
        ) : (
          <div className="hf-l7-thumb-fallback">
            <ImgPlaceholder />
          </div>
        )}
      </div>
    </button>
  )
}

function DragGhost({ item }: { item: SlotValue }) {
  return (
    <div className="hf-l7-drag-ghost">
      {item?.imageUrl ? (
        <img src={item.imageUrl} alt="" />
      ) : (
        <div className="hf-l7-drag-ghost-placeholder" />
      )}
      <span className="hf-l7-drag-ghost-title">{item?.title ?? 'Empty slot'}</span>
    </div>
  )
}

type Props = {
  slots: SlotValue[]
  invalidItemsBySlot: Map<number, HomepageFeaturedInvalidItem>
  onSlotClick: (slotIndex: number) => void
  onReorder?: (newSlots: SlotValue[]) => void
}

export default function FeaturedArticlesLayout7({ slots, invalidItemsBySlot, onSlotClick, onReorder }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id))
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveId(null)
    if (!over || active.id === over.id || !onReorder) return
    const from = Number(active.id)
    const to = Number(over.id)
    const next = [...slots]
    const tmp = next[from]
    next[from] = next[to]
    next[to] = tmp
    onReorder(next)
  }

  function invalid(slotIndex: number) {
    return invalidItemsBySlot.get(slotIndex + 1)
  }

  const activeSlot = activeId !== null ? (slots[Number(activeId)] ?? null) : null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="hf-l7">
        <div className="hf-l7-col hf-l7-col--left">
          <ConnectedSlotWrap slotId="1">
            <LeftStackCard slotIndex={1} item={slots[1] ?? null} invalid={invalid(1)} onClick={() => onSlotClick(1)} />
          </ConnectedSlotWrap>
          <ConnectedSlotWrap slotId="2">
            <LeftStackCard slotIndex={2} item={slots[2] ?? null} invalid={invalid(2)} onClick={() => onSlotClick(2)} />
          </ConnectedSlotWrap>
        </div>
        <div className="hf-l7-col hf-l7-col--center">
          <ConnectedSlotWrap slotId="0">
            <CenterHero slotIndex={0} item={slots[0] ?? null} invalid={invalid(0)} onClick={() => onSlotClick(0)} />
          </ConnectedSlotWrap>
        </div>
        <div className="hf-l7-col hf-l7-col--right">
          {[3, 4, 5, 6].map((i) => (
            <ConnectedSlotWrap key={i} slotId={String(i)}>
              <RightRow
                slotIndex={i}
                item={slots[i] ?? null}
                invalid={invalid(i)}
                onClick={() => onSlotClick(i)}
              />
            </ConnectedSlotWrap>
          ))}
        </div>
      </div>
      <DragOverlay dropAnimation={null}>
        {activeId !== null ? <DragGhost item={activeSlot} /> : null}
      </DragOverlay>
    </DndContext>
  )
}
