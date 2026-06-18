import { useState } from 'react'
import type { ItineraryItemBlock } from '../../types'
import type { ComposeStopReasonResult } from '../services/compose-stop-reason.service'

type StopReasonFieldProps = {
  item: ItineraryItemBlock
  disabled?: boolean
  onUpdateItem: (
    itemId: string,
    updater: (item: ItineraryItemBlock) => ItineraryItemBlock,
  ) => void
  /** Refine the operator's rough note into a Selection reason (ADR 0020). */
  onRefineStopReason: (
    itemId: string,
    roughReason: string,
  ) => Promise<ComposeStopReasonResult>
}

/**
 * "Why this pick" editor. The same field holds the operator's rough note and,
 * after Refine, the cleaned Selection reason — the operator reviews and can
 * tweak it before it seeds the blurb (preview-then-commit, ADR 0020).
 */
export function StopReasonField({
  item,
  disabled,
  onUpdateItem,
  onRefineStopReason,
}: StopReasonFieldProps) {
  const [isRefining, setIsRefining] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const value = item.selectionReason || ''
  const canRefine = !disabled && !isRefining && Boolean(value.trim())

  async function handleRefine() {
    setNote(null)
    setIsRefining(true)
    try {
      const result = await onRefineStopReason(item.id, value)
      onUpdateItem(item.id, (current) => ({ ...current, selectionReason: result.reason }))
      if (result.fallback) {
        setNote("Couldn't reach the AI — kept your note as-is. Edit it or try Refine again.")
      }
    } finally {
      setIsRefining(false)
    }
  }

  return (
    <div className="stl-stop-reason">
      <label className="stl-field-label-row">
        <span title="Why this stop belongs here. Internal — not public. Seeds the blurb. Write a rough note, then Refine to clean it up.">
          ⓘ Why this pick
        </span>
      </label>
      <textarea
        className="stl-field-input stl-stop-reason-input"
        rows={2}
        value={value}
        disabled={disabled || isRefining}
        placeholder="Why did you pick this? A rough note is fine — Refine cleans it up."
        onChange={(event) =>
          onUpdateItem(item.id, (current) => ({ ...current, selectionReason: event.target.value }))
        }
      />
      <div className="stl-stop-reason-actions">
        <button
          type="button"
          className="stl-btn stl-btn-secondary"
          onClick={() => void handleRefine()}
          disabled={!canRefine}
          title={
            value.trim()
              ? 'Clean up and expand your note into a tidy reason'
              : 'Write a rough note first'
          }
        >
          {isRefining ? 'Refining...' : 'Refine with AI'}
        </button>
        {note ? <span className="stl-stop-reason-note">{note}</span> : null}
      </div>
    </div>
  )
}
