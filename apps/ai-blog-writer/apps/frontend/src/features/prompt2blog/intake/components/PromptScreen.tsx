import { useState } from 'react'
import type { IntakeWriterPrompt } from '../intake.types'

/**
 * The assignment, before anything is spent.
 *
 * This is the whole prompt, not a preview of it and not a debug view. The old
 * pipeline assembled its instruction from a form rulebook, a work order, an
 * evidence packet, an SEO block and forty-one prohibitions, and no operator
 * ever saw a line of it. What is on this screen is what gets sent (ADR 0036).
 *
 * Read-only. Editorial intent changes in the grill, where it is recorded and
 * carried; typed into a textarea it would be untracked instruction that no
 * later reader of the run could account for.
 */

interface PromptScreenProps {
  prompt: IntakeWriterPrompt
  busy: boolean
  onGenerate: () => void
  onReopen: () => void
  onPaste: (markdown: string, writtenBy: string) => void
}

export function PromptScreen({
  prompt,
  busy,
  onGenerate,
  onReopen,
  onPaste,
}: PromptScreenProps) {
  const [copied, setCopied] = useState(false)
  const [pasting, setPasting] = useState(false)
  const [pasted, setPasted] = useState('')
  const [writtenBy, setWrittenBy] = useState('')

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt.text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2_000)
    } catch {
      // A browser that refuses the clipboard leaves the text on screen and
      // selectable, which is the fallback. Saying nothing beats an alert.
    }
  }

  return (
    <section className="p2b-intake" aria-label="The writing prompt">
      <p className="p2b-eyebrow">The prompt</p>

      <p className="p2b-note">
        This is exactly what the writer will be sent. Nothing is added to it
        afterwards.
      </p>

      <dl className="p2b-brief">
        <dt>Length</dt>
        <dd>about {prompt.target_word_count} words</dd>

        <dt>Writer</dt>
        <dd>Claude Opus, high effort, with web research</dd>

        <dt>Researching as of</dt>
        <dd>{prompt.research_date}</dd>

        <dt>Template</dt>
        <dd>
          {prompt.template_version} &middot; {prompt.style_version} &middot;{' '}
          {prompt.characters.toLocaleString()} characters
        </dd>
      </dl>

      {/* Selectable text in a scroll box, not a textarea. A textarea invites an
          edit that would be silently discarded, because the stored assignment
          is the one that gets sent. */}
      <pre className="p2b-prompt-text" tabIndex={0}>
        {prompt.text}
      </pre>

      <div className="p2b-intake-actions">
        <button type="button" onClick={onGenerate} disabled={busy}>
          Generate article
        </button>
        <button type="button" className="p2b-secondary" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button type="button" className="p2b-secondary" onClick={onReopen} disabled={busy}>
          Change something
        </button>
      </div>

      <p className="p2b-muted">
        {/* The one button on this screen that spends. Said before it is pressed,
            not after. */}
        Generating spends Claude allowance and takes several minutes. You can leave
        the page while it runs.
      </p>
      <p className="p2b-muted">
        To change what the article is, go back to the grill. Editing this text by
        hand would be instruction nothing on the run can account for.
      </p>

      {/* The other way out of this screen.
          The prompt is a copy-paste artifact on purpose, so it can be carried
          to any model. This brings the result back, and once the article is on
          the run everything after it -- the read, Saved Articles, staging --
          works on it unchanged. */}
      <div className="p2b-material">
        <p className="p2b-label">Wrote it somewhere else?</p>
        {pasting ? (
          <>
            <p className="p2b-muted">
              Paste the whole reply, headline and research note included. It gets
              split the same way as one written here.
            </p>
            <label className="p2b-visually-hidden" htmlFor="p2b-pasted">
              The article
            </label>
            <textarea
              id="p2b-pasted"
              className="p2b-paste-box"
              value={pasted}
              rows={10}
              placeholder={'# The headline\n\nThe article.\n\n## Research note\n\n- a source'}
              onChange={event => setPasted(event.target.value)}
              disabled={busy}
            />
            <label className="p2b-paste-label" htmlFor="p2b-written-by">
              Who wrote it? Recorded as your word, since nothing here can check it.
            </label>
            <input
              id="p2b-written-by"
              className="p2b-paste-who"
              value={writtenBy}
              placeholder="which model, and where"
              onChange={event => setWrittenBy(event.target.value)}
              disabled={busy}
            />
            <div className="p2b-intake-actions">
              <button
                type="button"
                onClick={() => onPaste(pasted, writtenBy)}
                disabled={busy || !pasted.trim()}
              >
                Use this as the draft
              </button>
              <button
                type="button"
                className="p2b-secondary"
                onClick={() => setPasting(false)}
                disabled={busy}
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="p2b-muted">
              Copy the prompt above, write the article wherever you like, and
              bring it back. Costs nothing, and it does not replace a draft this
              run already has.
            </p>
            <button
              type="button"
              className="p2b-secondary"
              onClick={() => setPasting(true)}
              disabled={busy}
            >
              Paste an article instead
            </button>
          </>
        )}
      </div>
    </section>
  )
}
