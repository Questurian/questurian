import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, ClipboardCopy, Download, MapPin } from 'lucide-react'
import { Badge, Step } from './Step'
import { runSummary } from './proposalText'
import type { ExportView, PromptSize, ResearchView } from '../../dayWork/types'

/**
 * Choosing the day's places — in the app, or by hand.
 *
 * **Choose places here** is the main way: one call in which Claude checks
 * what affects each choice, replaces what does not work, and returns the
 * places with one reason each. It writes no article. The answer waits for
 * the editor before anything is saved.
 *
 * **Copying is still here**, for an exhausted subscription or a different
 * model. Copying starts nothing, and the panel says so.
 *
 * What is sent sits behind one disclosure, with a character count: the
 * readable brief first, then the fixed instructions and the answer format.
 */

const FAULT_ADVICE: Record<string, string> = {
  quota_exhausted:
    'The Claude subscription is out of usage for now. Copy the prompt and run ' +
    'it somewhere else, or come back when it resets.',
  not_connected:
    'The Claude connection is not set up on this machine. Copy the prompt and ' +
    'run it yourself, or connect it in settings.',
  provider_unavailable:
    'Claude did not answer in time. Nothing is retried automatically; run it again when you are ready.',
  invalid_response:
    'The answer came back in a shape the app could not read. Nothing was saved.',
}

const SECTION_LABELS: Record<string, string> = {
  brief: 'Day brief',
  instructions: 'Instructions',
  revision: 'Requested change',
  schema: 'Answer format',
  system: 'System prompt',
}

function hasSize(size: ExportView['size'] | undefined): size is PromptSize {
  return Boolean(size && 'total' in size)
}

function count(value: number): string {
  return value.toLocaleString()
}

export interface DayPromptPanelProps {
  export_: ExportView | null
  research: ResearchView | null
  dayLabel: string
  tone: 'waiting' | 'active' | 'done'
  busy: boolean
  researching: boolean
  canBuild: boolean
  onBuild: () => void
  onResearch: () => void
  announce: (message: string) => void
}

export function DayPromptPanel({
  export_,
  research,
  dayLabel,
  tone,
  busy,
  researching,
  canBuild,
  onBuild,
  onResearch,
  announce,
}: DayPromptPanelProps) {
  const [copied, setCopied] = useState(false)
  const [clipboardFailed, setClipboardFailed] = useState(false)
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLTextAreaElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  async function copy() {
    if (!export_) return
    try {
      await navigator.clipboard.writeText(export_.prompt_text)
      setCopied(true)
      setClipboardFailed(false)
      announce('The prompt is on your clipboard.')
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 4000)
    } catch {
      setClipboardFailed(true)
      setOpen(true)
      requestAnimationFrame(() => {
        box.current?.focus()
        box.current?.select()
      })
      announce('This browser blocked the clipboard. The prompt is selected — copy it.')
    }
  }

  function download() {
    if (!export_) return
    const blob = new Blob([export_.prompt_text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${dayLabel.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-places-prompt.txt`
    link.click()
    URL.revokeObjectURL(url)
  }

  if (!export_) {
    return (
      <Step
        id="ip-prompt"
        title="Choose places"
        tone={tone}
        badge={<Badge tone="quiet">Not built</Badge>}
        lead="Turns the agreed summary into one request: the trip, the stay, this day's stops and what the other days already use."
        actions={
          <>
            <button
              type="button"
              className="ip-button-primary"
              onClick={onBuild}
              disabled={busy || !canBuild}
            >
              {busy ? 'Building…' : 'Build the request'}
            </button>
            <span className="ip-helper">
              {canBuild ? 'Free. Nothing here calls a model.' : 'Available once a summary is accepted.'}
            </span>
          </>
        }
      />
    )
  }

  const size = hasSize(export_.size) ? export_.size : null
  const sections = export_.sections ?? {}
  const revision = export_.revision

  return (
    <Step
      id="ip-prompt"
      title="Choose places"
      tone={tone}
      badge={
        export_.stale ? (
          <Badge tone="warning">Out of date</Badge>
        ) : copied ? (
          <Badge tone="done">Copied</Badge>
        ) : revision ? (
          <Badge>Change requested</Badge>
        ) : (
          <Badge>Ready</Badge>
        )
      }
      lead={
        revision ? (
          <>
            A changed version of proposal {revision.base_revision}: “{revision.change}”.
            Everything else is kept unless the change forces it.
          </>
        ) : (
          <>
            <strong>Choose places</strong> runs one call: Claude checks what affects
            each choice and returns a place with one reason for every stop. It
            takes a few minutes, and nothing is saved until you look at it. Or
            copy the request and run it yourself — copying starts nothing.
          </>
        )
      }
      actions={
        <>
          <button
            type="button"
            className="ip-button-primary"
            onClick={onResearch}
            disabled={busy || researching || export_.stale}
          >
            <MapPin size={16} aria-hidden />
            {researching ? 'Choosing…' : 'Choose places'}
          </button>
          <button type="button" className="ip-button-quiet" onClick={copy}>
            <ClipboardCopy size={15} aria-hidden />
            {copied ? 'Copied' : 'Copy instead'}
          </button>
          <button type="button" className="ip-button-quiet" onClick={download}>
            <Download size={15} aria-hidden /> Download
          </button>
          <button type="button" className="ip-button-quiet" onClick={onBuild} disabled={busy}>
            Rebuild
          </button>
        </>
      }
    >
      {researching ? (
        <p className="ip-notice" role="status">
          <MapPin size={16} aria-hidden />
          <span>
            Claude is choosing places. This takes a few minutes; you can leave
            this screen and the answer will be waiting.
          </span>
        </p>
      ) : null}

      {research && research.state === 'running' && research.stalled ? (
        <p className="ip-unchecked" role="status">
          <AlertTriangle size={16} aria-hidden /> A run sent at {research.started_at} never
          came back — the app was probably restarted while it worked. It may still
          have used some of your usage. Running it again starts a fresh one.
        </p>
      ) : null}

      {research && research.state === 'failed' ? (
        <p className="ip-unchecked" role="status">
          <AlertTriangle size={16} aria-hidden /> {research.detail}{' '}
          {FAULT_ADVICE[research.fault] ?? ''}
        </p>
      ) : null}

      {research && research.state === 'done' && research.for_current_export ? (
        <p className="ip-helper ip-run-summary">
          {runSummary(research)}.{' '}
          {research.saved_as_revision
            ? `Saved as version ${research.saved_as_revision}.`
            : 'The answer is below, waiting for you.'}
        </p>
      ) : null}

      {export_.stale ? (
        <div className="ip-unchecked" role="status">
          <AlertTriangle size={16} aria-hidden />
          <div>
            <p>This day changed since the request was built. Rebuild it first.</p>
            <ul className="ip-changes">
              {export_.changes.map(change => (
                <li key={change}>{change}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {clipboardFailed ? (
        <p className="ip-unchecked" role="status">
          This browser blocked the clipboard. The full request below is selected;
          copy it with the keyboard, or use Download.
        </p>
      ) : null}

      <details
        className="ip-disclosure"
        open={open}
        onToggle={event => setOpen((event.currentTarget as HTMLDetailsElement).open)}
      >
        <summary>
          What is sent{' '}
          <span className="ip-disclosure-note">
            {count(size?.total ?? export_.characters)} characters
          </span>
        </summary>
        {size ? (
          <dl className="ip-size-table" aria-label="What the call is handed, in characters">
            {Object.entries(size.sections).map(([name, value]) => (
              <div key={name}>
                <dt>{SECTION_LABELS[name] ?? name}</dt>
                <dd>{count(value)}</dd>
              </div>
            ))}
            <div className="ip-size-total">
              <dt>Sent to Claude</dt>
              <dd>{count(size.total)}</dd>
            </div>
          </dl>
        ) : null}
        {sections.brief ? (
          <pre className="ip-brief" tabIndex={0}>
            {sections.brief}
          </pre>
        ) : null}
        {sections.revision ? <pre className="ip-brief">{sections.revision}</pre> : null}
        {sections.instructions ? <pre className="ip-brief">{sections.instructions}</pre> : null}
        <p className="ip-prompt-meta">
          <span>Summary version {export_.direction_revision}</span>
          <span>
            Stamp <code>{export_.input_hash}</code>
          </span>
        </p>
        <label className="ip-sr-only" htmlFor="ip-prompt-text">
          The full request
        </label>
        <textarea
          id="ip-prompt-text"
          ref={box}
          className="ip-prompt-box"
          readOnly
          value={export_.prompt_text}
          onFocus={event => event.currentTarget.select()}
        />
      </details>
    </Step>
  )
}
