import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, ClipboardCopy, Download, Search } from 'lucide-react'
import { Badge, Step } from './Step'
import type { ExportView, PromptSize, ResearchView } from '../../dayWork/types'

/**
 * Getting the day researched — in the app, or by hand.
 *
 * **Run it here** is the primary way. It is ONE research call: Claude plans
 * the route, searches, reads pages and writes the day inside it, and the CLI
 * checks the answer's shape before the app sees it. There is no second
 * writer, checker or repair call behind it.
 *
 * **What is sent comes first.** The readable day brief leads — the trip, the
 * stops with their agreed requirements, the direction — because that is what
 * the operator can judge. The fixed instructions, the answer format and the
 * whole copyable text sit behind disclosures, with a character count for
 * each part. A brief that is larger than a normal day says so and names the
 * part that is large; nothing is cut to make it fit.
 *
 * **Copying is still here**, because a subscription can be exhausted or an
 * operator may want a different model. What copying is NOT is research:
 * nothing is dispatched, and the panel says so rather than showing a progress
 * state it would be inventing. The in-app run is the opposite: it knows what
 * it did, and says that too — including searches and page reads read off the
 * run's own transcript, and "unknown" when that could not be read.
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

const SECTION_LABELS: Record<keyof PromptSize['sections'], string> = {
  brief: 'Day brief',
  instructions: 'Instructions',
  writing: 'Voice and writing',
  schema: 'Answer format',
  system: 'System prompt',
}

function hasSize(size: ExportView['size'] | undefined): size is PromptSize {
  return Boolean(size && 'total' in size)
}

function count(value: number): string {
  return value.toLocaleString()
}

function elapsed(ms: number | null | undefined): string | null {
  if (ms === null || ms === undefined) return null
  const seconds = Math.round(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  return minutes > 0 ? `${minutes}m ${String(seconds % 60).padStart(2, '0')}s` : `${seconds}s`
}

function prettySchema(text: string | undefined): string {
  if (!text) return ''
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}

/** What a finished run did, in one line, with unknowns said as unknown. */
function runSummary(research: ResearchView): string {
  const parts: string[] = [`Researched on ${research.model || 'Claude'}`]
  const took = elapsed(research.duration_ms)
  if (took) parts.push(took)
  if (research.turns !== null) parts.push(`${research.turns} round trips`)
  const budget = research.budget && 'searches' in research.budget ? research.budget : null
  if (research.searches === null || research.searches === undefined ||
      research.fetches === null || research.fetches === undefined) {
    parts.push('searches and page reads unknown')
  } else {
    parts.push(
      `${research.searches} searches and ${research.fetches} page reads` +
        (budget ? ` (allowance about ${budget.searches} and ${budget.fetches})` : ''),
    )
  }
  if (research.cost_usd !== null) parts.push(`about $${research.cost_usd.toFixed(2)} of usage`)
  if (research.sent_characters) parts.push(`${count(research.sent_characters)} characters sent`)
  if (research.returned_characters) {
    parts.push(`${count(research.returned_characters)} returned`)
  }
  return parts.join(' · ')
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
  const [fullOpen, setFullOpen] = useState(false)
  const [givenOpen, setGivenOpen] = useState(false)
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
      announce('The research prompt is on your clipboard.')
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 4000)
    } catch {
      // A blocked clipboard is not an error worth a dialog. Open the full text
      // and select it so the operator can copy it with the keyboard.
      setClipboardFailed(true)
      setGivenOpen(true)
      setFullOpen(true)
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
    link.download = `${dayLabel.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-research-prompt.txt`
    link.click()
    URL.revokeObjectURL(url)
  }

  if (!export_) {
    return (
      <Step
        id="ip-prompt"
        title="Research"
        tone={tone}
        badge={<Badge tone="quiet">Not built</Badge>}
        lead="Turns the accepted direction into one research assignment: this day's stops with what was agreed for each, the trip, what the other days already use, the Questurian voice, and the answer format. Once it exists you can run it here or take it elsewhere."
        actions={
          <>
            <button
              type="button"
              className="ip-button-primary"
              onClick={onBuild}
              disabled={busy || !canBuild}
            >
              {busy ? 'Building…' : 'Build the research prompt'}
            </button>
            <span className="ip-helper">
              {canBuild
                ? 'Free. Nothing here calls a model.'
                : 'Available once a direction has been accepted.'}
            </span>
          </>
        }
      />
    )
  }

  const size = hasSize(export_.size) ? export_.size : null
  const budget = export_.budget && 'searches' in export_.budget ? export_.budget : null
  const sections = export_.sections ?? {}
  const legacy = Boolean(export_.legacy)
  // An export from before these fields existed is runnable as it always was.
  const runnable = export_.runnable !== false
  const oversized = Boolean(size?.over_budget)

  const fullText = (
    <>
      <label className="ip-sr-only" htmlFor="ip-prompt-text">
        The research prompt
      </label>
      <textarea
        id="ip-prompt-text"
        ref={box}
        className="ip-prompt-box"
        readOnly
        value={export_.prompt_text}
        onFocus={event => event.currentTarget.select()}
      />
    </>
  )

  return (
    <Step
      id="ip-prompt"
      title="Research"
      tone={tone}
      badge={
        export_.stale ? (
          <Badge tone="warning">Out of date</Badge>
        ) : legacy ? (
          <Badge tone="warning">Older format</Badge>
        ) : copied ? (
          <Badge tone="done">Copied</Badge>
        ) : oversized ? (
          <Badge tone="warning">Large brief</Badge>
        ) : (
          <Badge>Ready</Badge>
        )
      }
      lead={
        <>
          <strong>Research this day</strong> runs one call here: Claude searches
          the web, reads pages and writes the day — places, order and a
          paragraph for each. It takes several minutes, and the answer waits
          for you to review before anything is saved. Or copy the prompt and run
          it yourself — copying starts nothing, and the app cannot see what
          happens out there.
        </>
      }
      actions={
        <>
          <button
            type="button"
            className="ip-button-primary"
            onClick={onResearch}
            disabled={busy || researching || export_.stale || !runnable}
          >
            <Search size={16} aria-hidden />
            {researching
              ? 'Researching…'
              : oversized
                ? 'Research this day with this scope'
                : 'Research this day'}
          </button>
          <button type="button" className="ip-button-quiet" onClick={copy}>
            <ClipboardCopy size={15} aria-hidden />
            {copied ? 'Copied' : 'Copy the prompt instead'}
          </button>
          <button type="button" className="ip-button-quiet" onClick={download}>
            <Download size={15} aria-hidden /> Download
          </button>
          <button
            type="button"
            className="ip-button-quiet"
            onClick={onBuild}
            disabled={busy}
          >
            Rebuild
          </button>
        </>
      }
    >
      {researching ? (
        <p className="ip-notice" role="status">
          <Search size={16} aria-hidden />
          <span>
            Claude is searching, reading pages and writing the day. This takes
            several minutes. You can leave this screen — the run keeps going and
            the answer will be waiting.
          </span>
        </p>
      ) : null}

      {research && research.state === 'running' && research.stalled ? (
        <p className="ip-unchecked" role="status">
          <AlertTriangle size={16} aria-hidden /> A research run was sent at{' '}
          {research.started_at} and never came back — the app was probably
          restarted while it was working. It may still have used some of your
          usage. Running it again starts a fresh one.
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
          {research.turns !== null && research.turns <= 1
            ? 'One round trip means it never actually searched — read the result carefully.'
            : research.saved_as_revision
              ? `Saved as version ${research.saved_as_revision}.`
              : 'The answer is in step 4, checked and waiting for you.'}
        </p>
      ) : null}

      {export_.stale ? (
        <p className="ip-unchecked" role="status">
          <AlertTriangle size={16} aria-hidden /> This day has changed since this
          prompt was built. An answer to it will be refused on import — rebuild the
          prompt before running the research.
        </p>
      ) : null}

      {legacy ? (
        <p className="ip-unchecked" role="status">
          <AlertTriangle size={16} aria-hidden /> This prompt was built in the
          older, larger format.{' '}
          {runnable
            ? 'It will run as it was issued.'
            : 'Rebuild it to research here — an answer you already have for it can still be pasted in step 4.'}
        </p>
      ) : null}

      {clipboardFailed ? (
        <p className="ip-unchecked" role="status">
          This browser blocked the clipboard. The full prompt below is selected;
          copy it with the keyboard, or use Download.
        </p>
      ) : null}

      {size ? (
        <>
          <p className="ip-scope">
            <strong>One research call with web searches.</strong>{' '}
            {budget
              ? `About ${budget.searches} searches and ${budget.fetches} page reads for ${budget.venues} venue stop${budget.venues === 1 ? '' : 's'} — guidance for the model, not a hard stop.`
              : null}
          </p>

          {oversized ? (
            <p className="ip-unchecked" role="status">
              <AlertTriangle size={16} aria-hidden /> This brief is{' '}
              {count(size.total)} characters, over the {count(size.budget)} a
              normal day fits in. The largest part is the{' '}
              {SECTION_LABELS[size.largest_section].toLowerCase()} (
              {count(size.sections[size.largest_section])}). Nothing was cut:
              every accepted requirement is in it. Run it with this scope, or
              reopen the interview and narrow the direction first.
            </p>
          ) : null}

          <details
            className="ip-disclosure"
            open={givenOpen}
            onToggle={event => setGivenOpen((event.currentTarget as HTMLDetailsElement).open)}
          >
            <summary>
              What the research is given{' '}
              <span className="ip-disclosure-note">
                {count(size.total)} characters · day brief, instructions, answer format
              </span>
            </summary>
            <dl className="ip-size-table" aria-label="What the call is handed, in characters">
              {(['brief', 'instructions', 'writing', 'schema', 'system'] as const).map(name => (
                <div key={name} className={name === size.largest_section ? 'ip-size-largest' : ''}>
                  <dt>{SECTION_LABELS[name]}</dt>
                  <dd>{count(size.sections[name])}</dd>
                </div>
              ))}
              <div className="ip-size-total">
                <dt>Sent to Claude</dt>
                <dd>
                  {count(size.total)} <span className="ip-helper">of {count(size.budget)}</span>
                </dd>
              </div>
            </dl>

            <h4 className="ip-issue-group">The day brief</h4>
            <pre className="ip-brief" tabIndex={0}>
              {sections.brief}
            </pre>

            <details className="ip-disclosure">
              <summary>
                Instructions{' '}
                <span className="ip-disclosure-note">
                  {count(size.sections.instructions + size.sections.writing)} characters
                </span>
              </summary>
              <pre className="ip-brief">{sections.instructions}</pre>
              <pre className="ip-brief">{sections.writing}</pre>
            </details>

            <details className="ip-disclosure">
              <summary>
                Output format{' '}
                <span className="ip-disclosure-note">{count(size.sections.schema)} characters</span>
              </summary>
              <pre className="ip-brief">{prettySchema(sections.schema)}</pre>
            </details>

            <details
              className="ip-disclosure"
              open={fullOpen}
              onToggle={event => setFullOpen((event.currentTarget as HTMLDetailsElement).open)}
            >
              <summary>
                Full export{' '}
                <span className="ip-disclosure-note">
                  {count(size.copy_characters)} characters · what Copy and Download give you
                </span>
              </summary>
              <p className="ip-prompt-meta">
                <span>Direction revision {export_.direction_revision}</span>
                <span>
                  Stamp <code>{export_.input_hash}</code>
                </span>
                <span>
                  Voice <code>{export_.voice_version}</code>
                </span>
              </p>
              {fullText}
            </details>
          </details>
        </>
      ) : (
        <>
          <p className="ip-prompt-meta">
            <span>{count(export_.characters)} characters</span>
            <span>Direction revision {export_.direction_revision}</span>
            <span>
              Stamp <code>{export_.input_hash}</code>
            </span>
            <span>
              Voice <code>{export_.voice_version}</code>
            </span>
          </p>
          {fullText}
        </>
      )}
    </Step>
  )
}
