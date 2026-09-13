import { useCallback, useEffect, useRef, useState } from 'react'
import type { ListIntro } from '../types'
import { revealSoon } from '../revealInModal'
import { useLockPageScroll } from '../useLockPageScroll'
import { CopyButton, FlowMark } from './ResearchWorkspace'

/** Above the places: the intro once written, or the one next action, or why
 *  it is still locked. */
export function ListIntroPanel({
  intro,
  error,
  onSave
}: {
  intro: ListIntro | null
  error: string
  onSave: (text: string) => Promise<boolean>
}) {
  const [open, setOpen] = useState(false)
  // Stable, so the editor's focus effect does not rerun while typing.
  const close = useCallback(() => setOpen(false), [])
  if (!intro) return error ? <p className="lp-error" role="alert">{error}</p> : null
  const locked = !intro.ready_to_write
  return (
    <section
      className={`lp-intro${intro.complete ? ' lp-intro-complete' : ''}`}
      aria-label="List intro"
    >
      <div className="lp-entry-heading">
        <div>
          <p className="lp-entry-status">
            {intro.complete
              ? 'Intro written · list 100% ready'
              : intro.text && intro.stale
                ? 'Intro out of date: the list changed after it was saved'
                : intro.text
                  ? 'Intro written'
                  : locked
                    ? 'Intro locked'
                    : 'Every place is done'}
          </p>
          <h3 className="lp-intro-title">The intro</h3>
        </div>
        {intro.text ? (
          <button type="button" className="lp-tool" onClick={() => setOpen(true)}>
            Edit intro
          </button>
        ) : (
          <button
            type="button"
            className="lp-tool lp-tool-primary"
            disabled={locked}
            onClick={() => setOpen(true)}
          >
            Write the intro
          </button>
        )}
      </div>
      {intro.text ? (
        <p className="lp-entry-text">{intro.text}</p>
      ) : (
        locked && (
          <p className="lp-muted lp-intro-why">
            Unlocks when every place is done.
          </p>
        )
      )}
      {locked && (
        <ul className="lp-intro-blockers">
          {intro.blockers.map((blocker) => (
            <li key={blocker.code}>{blocker.message}</li>
          ))}
        </ul>
      )}
      {error && (
        <p className="lp-error" role="alert">
          {error}
        </p>
      )}
      {open && (
        <IntroEditor
          intro={intro}
          error={error}
          onSave={onSave}
          onClose={close}
        />
      )}
    </section>
  )
}

function IntroEditor({
  intro,
  error,
  onSave,
  onClose
}: {
  intro: ListIntro
  error: string
  onSave: (text: string) => Promise<boolean>
  onClose: () => void
}) {
  const [text, setText] = useState(intro.text)
  const [busy, setBusy] = useState(false)
  const [showPrompt, setShowPrompt] = useState(false)
  const promptBox = useRef<HTMLPreElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  useLockPageScroll()

  useEffect(() => {
    closeButton.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const ready = intro.ready_to_write
  const changed = text.trim() !== intro.text
  return (
    <div
      className="lp-modal-overlay"
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        className="lp-modal lp-research lp-research-workbench"
        role="dialog"
        aria-modal="true"
        aria-label="The intro"
      >
        <header className="lp-modal-head">
          <h3 className="lp-modal-title">The intro</h3>
          <button
            ref={closeButton}
            type="button"
            className="lp-modal-close"
            aria-label="Close intro"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="lp-workspace">
          {error && (
            <p role="alert" className="lp-error lp-workspace-message">
              {error}
            </p>
          )}
          <section className="lp-workspace-blurb" aria-label="Intro">
            <section className="lp-gather" aria-label="Get the intro">
              <header className="lp-gather-head">
                <div>
                  <p className="lp-part-kicker">Part 1</p>
                  <h4>Get the intro</h4>
                  <p>
                    Run the intro prompt in your strongest model. It carries the
                    list and one line per place, not the blurbs.
                  </p>
                </div>
              </header>
              <ol className="lp-flow">
                <li className="lp-flow-step">
                  <FlowMark number={1} done={!!intro.text} />
                  <div className="lp-flow-body">
                    <h5>Copy the intro prompt</h5>
                    {!ready && (
                      <ul className="lp-flow-hint lp-intro-blockers">
                        {intro.blockers.map((blocker) => (
                          <li key={blocker.code}>{blocker.message}</li>
                        ))}
                      </ul>
                    )}
                    <div className="lp-workspace-actions">
                      <CopyButton
                        label="Copy intro prompt"
                        text={intro.prompt}
                        disabled={busy || !ready}
                      />
                      {ready && (
                        <button
                          className="lp-link-button"
                          aria-expanded={showPrompt}
                          onClick={() => {
                            setShowPrompt(!showPrompt)
                            if (!showPrompt) revealSoon(() => promptBox.current)
                          }}
                        >
                          {showPrompt ? 'Hide prompt' : 'View intro prompt'}
                        </button>
                      )}
                    </div>
                    {ready && showPrompt && (
                      <pre ref={promptBox} className="lp-workspace-prompt">
                        {intro.prompt}
                      </pre>
                    )}
                  </div>
                </li>
                <li className="lp-flow-step">
                  <FlowMark number={2} done={!!intro.text && !changed} />
                  <div className="lp-flow-body">
                    <h5>Paste the answer into the intro below</h5>
                  </div>
                </li>
              </ol>
            </section>
            <div className="lp-handoff" aria-hidden="true">
              <span>The answer becomes the intro</span>
            </div>
            <section className="lp-brief" aria-label="Intro text editor">
              <header className="lp-brief-head">
                <div>
                  <p className="lp-part-kicker">Part 2</p>
                  <h4>The intro</h4>
                  <p>What sits above the list. Edit it freely before saving.</p>
                </div>
                <span className={intro.text ? 'lp-workspace-pill-ready' : undefined}>
                  {intro.text ? 'Intro ready' : 'Not written yet'}
                  {intro.stale ? ' · review needed' : ''}
                </span>
              </header>
              <textarea
                aria-label="Intro text"
                placeholder="Paste the intro here, or write it yourself."
                rows={10}
                value={text}
                disabled={busy}
                onChange={(event) => setText(event.target.value)}
              />
              <footer className="lp-brief-foot">
                <button
                  className="lp-tool lp-tool-primary"
                  disabled={
                    busy || !ready || (!changed && !intro.stale) || !text.trim()
                  }
                  onClick={async () => {
                    setBusy(true)
                    const saved = await onSave(text)
                    setBusy(false)
                    if (saved) onClose()
                  }}
                >
                  {intro.stale && !changed ? 'Confirm intro' : 'Save intro'}
                </button>
              </footer>
            </section>
          </section>
        </div>
      </div>
    </div>
  )
}
