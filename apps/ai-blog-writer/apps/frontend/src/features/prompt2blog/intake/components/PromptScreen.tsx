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
  onReopen: () => void
}

export function PromptScreen({ prompt, busy, onReopen }: PromptScreenProps) {
  const [copied, setCopied] = useState(false)

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
        <button type="button" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button type="button" className="p2b-secondary" onClick={onReopen} disabled={busy}>
          Change something
        </button>
      </div>

      <p className="p2b-muted">
        {/* Phase 3 of ADR 0036 replaces this line with the button. Saying so is
            better than showing a disabled control with no explanation. */}
        Generating the article inside the app is not switched on yet. Copy this into
        a Claude Opus chat with research enabled in the meantime.
      </p>
      <p className="p2b-muted">
        To change what the article is, go back to the grill. Editing this text by
        hand would be instruction nothing on the run can account for.
      </p>
    </section>
  )
}
