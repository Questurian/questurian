type StopBlurbComposeChoiceModalProps = {
  isOpen: boolean
  /** Reader-facing title of the stop being written, for the copy. */
  stopTitle: string
  dayNumber: number
  /** True when writing only this stop may strand a sibling's handoff (ADR 0022). */
  strandsNeighbor: boolean
  disabled?: boolean
  onJustThisStop: () => void
  onWholeDay: () => void
  onClose: () => void
}

/**
 * The "always ask" choice shown when an operator writes the blurb for a stop in a
 * day that already has other blurbs (ADR 0022). Two real outcomes:
 * "just this stop" (siblings kept, the new blurb threads off them) vs "recompose
 * the whole day" (every blurb rewritten, hand-edits included). On a mid-insert or
 * swap the just-this-stop path is flagged because a neighbor's handoff can read
 * stale — the operator may still proceed; recomposing the day is the clean fix.
 */
export function StopBlurbComposeChoiceModal({
  isOpen,
  stopTitle,
  dayNumber,
  strandsNeighbor,
  disabled,
  onJustThisStop,
  onWholeDay,
  onClose,
}: StopBlurbComposeChoiceModalProps) {
  if (!isOpen) return null

  return (
    <div
      className="stl-modal-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget && !disabled) {
          onClose()
        }
      }}
    >
      <div
        className="stl-picker-modal stl-blurb-choice-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Write stop blurb"
      >
        <div className="stl-picker-modal__header">
          <h3>Write blurb for “{stopTitle}”</h3>
          <button
            type="button"
            className="stl-picker-modal__close"
            onClick={onClose}
            disabled={disabled}
          >
            ×
          </button>
        </div>

        <div className="stl-blurb-choice-modal__body">
          <p className="stl-blurb-choice-modal__lead">
            Day {dayNumber} already has written blurbs. How should this one be composed?
          </p>

          <div className="stl-blurb-choice-modal__option">
            <button
              type="button"
              className="stl-btn"
              onClick={onJustThisStop}
              disabled={disabled}
            >
              Write just this stop
            </button>
            <span className="stl-blurb-choice-modal__hint">
              Keeps the day’s other blurbs as they are; this one is written to read
              alongside them.
            </span>
            {strandsNeighborWarning(strandsNeighbor)}
          </div>

          <div className="stl-blurb-choice-modal__option">
            <button
              type="button"
              className="stl-btn stl-btn-secondary"
              onClick={onWholeDay}
              disabled={disabled}
            >
              Recompose the whole day
            </button>
            <span className="stl-blurb-choice-modal__hint">
              Rewrites every blurb in Day {dayNumber} as one connected set,
              including any you’ve hand-edited.
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function strandsNeighborWarning(strands: boolean) {
  if (!strands) return null
  return (
    <span className="stl-blurb-choice-modal__warning" role="alert">
      ⚠ The stop before this one may reference what used to come next, so its
      transition could read stale. Recompose the day to fix it.
    </span>
  )
}
