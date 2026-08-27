import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const WORKS_WELL = [
  'What a month in Lima costs',
  'How to get from the airport into the city',
  'What changed at the new terminal this year',
]

const TAKES_MORE_ROUNDS = [
  'Is Lima worth it?',
  'The best neighborhood in Lima',
  'Why Lima beats Medellín',
]

/**
 * What this pipeline is good at, before the operator has spent anything.
 *
 * A fact-gathering pipeline refuses to write until its research questions have
 * answers, so an idea whose central question is a matter of taste costs several
 * chatbot round trips and can still end unanswered. That is expensive to learn
 * by doing. It sits behind a control rather than in the step body because it is
 * read once and then known.
 */
export function ArticleFitGuide() {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  // Every close returns focus to the control that opened it, Escape included:
  // the element focus was sitting on is the one being unmounted, so without
  // this a keyboard operator is dropped back to the top of the document.
  const close = useCallback(() => {
    setOpen(false)
    triggerRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [close, open])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="p2b-guide-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span className="p2b-guide-trigger-mark" aria-hidden="true">
          i
        </span>
        What kind of article works here?
      </button>

      {open && createPortal(
        <div
          className="p2b-modal-overlay"
          onClick={event => event.target === event.currentTarget && close()}
        >
          <div
            className="p2b-modal p2b-modal--guide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="p2b-article-fit-heading"
          >
            <div className="p2b-modal__header">
              <div>
                <p className="p2b-modal__eyebrow">Before you start</p>
                <h3 id="p2b-article-fit-heading">What kind of article works here</h3>
                <p className="p2b-modal__lede">
                  This pipeline gathers facts. It will not write anything until its research
                  questions have answers, so the idea you pick decides how much work it takes.
                </p>
              </div>
              <button
                ref={closeRef}
                type="button"
                className="p2b-modal__close"
                onClick={close}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="p2b-modal__body p2b-guide-body">
              <section>
                <h4>The test</h4>
                <p className="p2b-guide-test">
                  Could two people look it up and get the same answer?
                </p>
                <p>
                  If yes, it is a good research question. If it depends on how you feel about it,
                  research comes back empty and you go another round with your chatbot.
                </p>
              </section>

              <div className="p2b-guide-columns">
                <section>
                  <h4>Finishes fast</h4>
                  <ul>
                    {WORKS_WELL.map(example => (
                      <li key={example}>{example}</li>
                    ))}
                  </ul>
                </section>
                <section>
                  <h4>Takes more rounds</h4>
                  <ul>
                    {TAKES_MORE_ROUNDS.map(example => (
                      <li key={example}>{example}</li>
                    ))}
                  </ul>
                </section>
              </div>

              <section>
                <h4>One thing per question</h4>
                <p>
                  "What housing, food, and transport cost" is three questions wearing one coat. If
                  research finds two of them, the whole question comes back{' '}
                  <strong>Partly answered</strong> and you pay for another round to close the
                  third. Ask one thing at a time.
                </p>
              </section>

              <section>
                <h4>Why it matters</h4>
                <p>
                  Every question that comes back unanswered or partly answered sends you to your
                  chatbot for another round, and each round is a long prompt. Two sharp questions
                  beat five loose ones.
                </p>
                <p>
                  Trim them in step 3, <strong>before</strong> you research. Once research is
                  attached, changing the commission drops it and the research starts over.
                </p>
              </section>
            </div>
          </div>
        </div>,
        // Step 1 collapses by setting `hidden` on its body, and a fixed overlay
        // rendered inside that subtree disappears with it. The dialog belongs to
        // the page, not to the step that opened it.
        document.body,
      )}
    </>
  )
}
