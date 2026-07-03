/**
 * Always-visible divider that inserts a blank stop at a precise position, so
 * operators no longer append-then-move. Inherits the panel fieldset's disabled
 * state when stops are locked.
 */
export function StopInsertZone({ onInsert, label }: { onInsert: () => void; label: string }) {
  return (
    <div className="stl-stop-insert-zone">
      <button type="button" className="stl-stop-insert-btn" onClick={onInsert} title={label}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Stop
      </button>
    </div>
  )
}
