import { useState } from 'react'
import type { ItineraryFillIdeas } from '../services/fill-ideas.api'

type ItineraryFillIdeasModalProps = {
  isOpen: boolean
  onClose: () => void
  isLoading: boolean
  error: string | null
  ideas: ItineraryFillIdeas | null
  /** The prompt that produced these ideas; '' when reading a document back from store. */
  prompt: string
  /** Which day this document is for (0-based). */
  dayIndex: number
}

/**
 * Fill-in ideas, shown and then thrown away.
 *
 * The HTML is rendered in a sandboxed iframe rather than into the page. Two
 * reasons, and the second is the one that matters: a model-authored document
 * brings its own <style>, which would otherwise repaint the builder around it,
 * and a `sandbox` with no `allow-scripts` means nothing in that document can
 * run — including anything it picked up from a page it read while researching.
 *
 * `allow-same-origin` is load-bearing and not a loosening. A bare `sandbox=""`
 * gives the frame an opaque origin, under which a `srcDoc` document renders as
 * a blank white box — verified against this exact reply. The token only matters
 * alongside `allow-scripts`, which is absent, so nothing can run and nothing can
 * reach the parent.
 *
 * Nothing here writes to the draft. The operator reads it and fills the slots
 * by hand, which is the whole point of the feature.
 */
export function ItineraryFillIdeasModal({
  isOpen,
  onClose,
  isLoading,
  error,
  ideas,
  prompt,
  dayIndex,
}: ItineraryFillIdeasModalProps) {
  const [isPromptOpen, setIsPromptOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  if (!isOpen) return null

  const copyHtml = async () => {
    if (!ideas) return
    try {
      await navigator.clipboard.writeText(ideas.html)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div
      className="stl-modal-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="stl-picker-modal stl-inspect-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Fill-in ideas"
      >
        <div className="stl-picker-modal__header">
          <h3>
            Ideas for the empty slots
            {ideas ? (
              <span className="stl-inspect-target"> — {ideas.model_used}</span>
            ) : null}
          </h3>
          <div className="stl-inline-actions">
            {ideas ? (
              <button
                type="button"
                className="stl-btn stl-btn-secondary"
                onClick={() => void copyHtml()}
              >
                {copied ? 'Copied' : 'Copy HTML'}
              </button>
            ) : null}
            {ideas && prompt ? (
              <button
                type="button"
                className="stl-btn stl-btn-secondary"
                onClick={() => setIsPromptOpen((open) => !open)}
              >
                {isPromptOpen ? 'Hide prompt' : 'Show prompt'}
              </button>
            ) : null}
            <button
              type="button"
              className="stl-picker-modal__close"
              onClick={onClose}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="stl-fill-ideas-body">
          {isLoading ? (
            <p className="stl-inspect-empty">
              Thinking Day {dayIndex + 1} through and looking places up. This takes
              a few minutes.
            </p>
          ) : null}

          {error ? <p className="stl-error">{error}</p> : null}

          {isPromptOpen ? (
            <pre className="stl-fill-ideas-prompt">{prompt}</pre>
          ) : null}

          {ideas && !isPromptOpen ? (
            <iframe
              className="stl-fill-ideas-frame"
              title="Fill-in ideas"
              sandbox="allow-same-origin"
              srcDoc={ideas.html}
            />
          ) : null}
        </div>

        {ideas ? (
          <p className="stl-fill-ideas-footer">
            Inspiration only — nothing here has been written into the draft.
            {typeof ideas.elapsed_seconds === 'number'
              ? ` Took ${Math.round(ideas.elapsed_seconds)}s.`
              : ''}
            {typeof ideas.cost_usd === 'number'
              ? ` Cost $${ideas.cost_usd.toFixed(2)}.`
              : ''}
          </p>
        ) : null}
      </div>
    </div>
  )
}
