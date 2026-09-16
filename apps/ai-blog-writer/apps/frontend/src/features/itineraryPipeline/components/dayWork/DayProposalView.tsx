import { useState } from 'react'
import { AlertTriangle, Check, HelpCircle, RefreshCw, Replace } from 'lucide-react'
import { Badge, Step } from './Step'
import { Link, ProposalPicks } from './ProposalPicks'
import { safeHref, stayWords, whenWords } from './proposalText'
import type {
  DaySlotView,
  DayStayView,
  HistoryRow,
  PreviousVersionView,
  ProposalView,
  SelectionPick,
} from '../../dayWork/types'

/**
 * The saved proposal: where the day goes, which places, and why.
 *
 * It leads with the day's overview and the places in order, one reason each.
 * Each place can be kept (nothing to do), swapped, or looked at in detail. A
 * question only appears when a firm requirement could not be met, and
 * answering it asks for a revised proposal. There is no review checklist and
 * nothing to tick: the editor judges the proposal by reading it.
 *
 * Swapping has two ways. **Ask for another** is a paid revision of the day
 * that keeps everything else. **Choose it myself** is free and saved at once
 * as a new version; the journeys next to that stop lose their estimate.
 */

export interface DayProposalViewProps {
  proposal: ProposalView
  slots: DaySlotView[]
  stay: DayStayView
  history: HistoryRow[]
  previous: PreviousVersionView | null
  busy: boolean
  researching: boolean
  onRevise: (change: string, slotId?: string) => void
  onSwap: (slotId: string, name: string, area: string, reason: string) => void
}

function SwapForm({
  pick,
  label,
  busy,
  onRevise,
  onSwap,
  onClose,
}: {
  pick: SelectionPick
  label: string
  busy: boolean
  onRevise: DayProposalViewProps['onRevise']
  onSwap: DayProposalViewProps['onSwap']
  onClose: () => void
}) {
  const [mode, setMode] = useState<'ask' | 'mine'>('ask')
  const [wish, setWish] = useState('')
  const [name, setName] = useState('')
  const [area, setArea] = useState('')
  const [reason, setReason] = useState('')
  const id = `ip-swap-${pick.slotId}`
  const current = pick.name ? `“${pick.name}”` : 'this stop'

  return (
    <div className="ip-swap" role="group" aria-labelledby={`${id}-title`}>
      <p className="ip-swap-title" id={`${id}-title`}>
        Swap {label}
      </p>
      <div className="ip-swap-modes" role="radiogroup" aria-label="How to swap">
        <label>
          <input type="radio" name={`${id}-mode`} checked={mode === 'ask'} onChange={() => setMode('ask')} />
          Ask for another
        </label>
        <label>
          <input type="radio" name={`${id}-mode`} checked={mode === 'mine'} onChange={() => setMode('mine')} />
          Choose it myself
        </label>
      </div>
      {mode === 'ask' ? (
        <>
          <label htmlFor={`${id}-wish`}>What should be different? (optional)</label>
          <input
            id={`${id}-wish`}
            value={wish}
            placeholder="Quieter, closer to the market, less formal…"
            onChange={event => setWish(event.target.value)}
          />
          <div className="ip-step-actions">
            <button
              type="button"
              className="ip-button-primary"
              disabled={busy}
              onClick={() => {
                onRevise(
                  `Replace ${current} with a different place for this stop.` +
                    (wish.trim() ? ` ${wish.trim()}` : ''),
                  pick.slotId,
                )
                onClose()
              }}
            >
              Ask for another
            </button>
            <button type="button" className="ip-button-quiet" onClick={onClose}>
              Cancel
            </button>
            <span className="ip-helper">One call; the rest of the day is kept.</span>
          </div>
        </>
      ) : (
        <>
          <label htmlFor={`${id}-name`}>Place</label>
          <input id={`${id}-name`} value={name} onChange={event => setName(event.target.value)} />
          <label htmlFor={`${id}-area`}>Area (optional)</label>
          <input id={`${id}-area`} value={area} onChange={event => setArea(event.target.value)} />
          <label htmlFor={`${id}-reason`}>Why it fits (optional)</label>
          <input id={`${id}-reason`} value={reason} onChange={event => setReason(event.target.value)} />
          <div className="ip-step-actions">
            <button
              type="button"
              className="ip-button-primary"
              disabled={busy || !name.trim()}
              onClick={() => {
                onSwap(pick.slotId, name, area, reason)
                onClose()
              }}
            >
              Use this place
            </button>
            <button type="button" className="ip-button-quiet" onClick={onClose}>
              Cancel
            </button>
            <span className="ip-helper">Free. Saved as a new version.</span>
          </div>
        </>
      )}
    </div>
  )
}

function Question({
  question,
  label,
  busy,
  onRevise,
}: {
  question: ProposalView['selection']['questions'][number]
  label: string | null
  busy: boolean
  onRevise: DayProposalViewProps['onRevise']
}) {
  const [answer, setAnswer] = useState('')
  const decide = (choice: string) =>
    onRevise(
      `The editor answered “${question.question}”: ${choice}`,
      question.slotId ?? undefined,
    )
  return (
    <li className="ip-question">
      <p>
        {label ? <strong>{label}: </strong> : null}
        {question.question}
      </p>
      <div className="ip-question-options">
        {question.options.map(option => (
          <button
            key={option}
            type="button"
            className="ip-button-quiet ip-button-small"
            disabled={busy}
            onClick={() => decide(option)}
          >
            {option}
          </button>
        ))}
      </div>
      <div className="ip-question-own">
        <label className="ip-sr-only" htmlFor={`ip-q-${question.question}`}>
          Your own answer
        </label>
        <input
          id={`ip-q-${question.question}`}
          value={answer}
          placeholder="Or answer in your own words"
          onChange={event => setAnswer(event.target.value)}
        />
        <button
          type="button"
          className="ip-button-quiet ip-button-small"
          disabled={busy || !answer.trim()}
          onClick={() => decide(answer.trim())}
        >
          Answer
        </button>
      </div>
    </li>
  )
}

export function DayProposalView({
  proposal,
  slots,
  stay,
  history,
  previous,
  busy,
  researching,
  onRevise,
  onSwap,
}: DayProposalViewProps) {
  const [swapping, setSwapping] = useState<string | null>(null)
  const [dayChange, setDayChange] = useState('')
  const selection = proposal.selection
  const labels = new Map(slots.map(slot => [slot.id, slot.label]))
  const questions = selection.questions
  const open = selection.picks.filter(pick => pick.status === 'unresolved').length
  const locked = busy || researching
  const stayLine = stayWords(stay, selection.stay)
  const chosenStay = selection.stay?.name ? selection.stay : null

  return (
    <Step
      id="ip-result"
      title="Proposal"
      tone="result"
      badge={
        proposal.report.completeness.complete ? (
          <Badge tone="done">
            <Check size={12} aria-hidden /> Every stop filled
          </Badge>
        ) : (
          <Badge tone="warning">
            {questions.length > 0
              ? `${questions.length} question${questions.length === 1 ? '' : 's'} for you`
              : `${open} stop${open === 1 ? '' : 's'} open`}
          </Badge>
        )
      }
    >
      <div className="ip-proposal">
        <p className="ip-proposal-overview">{selection.overview}</p>
        {selection.tripFit ? <p className="ip-proposal-fit">{selection.tripFit}</p> : null}
        {stayLine ? <p className="ip-proposal-stay">{stayLine}</p> : null}
        {chosenStay ? (
          <p className="ip-helper">
            Recommended stay: <Link href={safeHref(chosenStay.mapsUrl)}>{chosenStay.name}</Link>
            {chosenStay.reason ? ` — ${chosenStay.reason}` : ''} A suggestion, not a booking.
          </p>
        ) : null}
        <p className="ip-helper">
          Version {proposal.revision}, {whenWords(proposal.saved_at)}
          {proposal.origin === 'editor_swap' ? ' · your edit' : ''}
        </p>

        {proposal.stale ? (
          <div className="ip-unchecked" role="status">
            <AlertTriangle size={16} aria-hidden />
            <div>
              <p>Something this day depends on changed since these places were chosen:</p>
              <ul className="ip-changes">
                {proposal.changes.map(change => (
                  <li key={change}>{change}</li>
                ))}
              </ul>
              <button
                type="button"
                className="ip-button-quiet ip-button-small"
                disabled={locked}
                onClick={() =>
                  onRevise(
                    `The trip changed since this proposal: ${proposal.changes.join(' ')} ` +
                      'Keep the current choices unless they no longer fit.',
                  )
                }
              >
                <RefreshCw size={14} aria-hidden /> Refresh the proposal
              </button>
            </div>
          </div>
        ) : null}

        {questions.length > 0 ? (
          <section className="ip-questions" aria-labelledby="ip-questions-heading">
            <h4 className="ip-issue-group" id="ip-questions-heading">
              <HelpCircle size={14} aria-hidden /> Needs your decision
            </h4>
            <ul>
              {questions.map(question => (
                <Question
                  key={question.question}
                  question={question}
                  label={question.slotId ? (labels.get(question.slotId) ?? null) : null}
                  busy={locked}
                  onRevise={onRevise}
                />
              ))}
            </ul>
          </section>
        ) : null}

        <ProposalPicks
          selection={selection}
          slots={slots}
          actions={pick => (
            <button
              type="button"
              className="ip-button-quiet ip-button-small"
              disabled={locked}
              aria-expanded={swapping === pick.slotId}
              onClick={() => setSwapping(current => (current === pick.slotId ? null : pick.slotId))}
            >
              <Replace size={13} aria-hidden /> {pick.status === 'selected' ? 'Swap place' : 'Fill this stop'}
            </button>
          )}
          below={pick =>
            swapping === pick.slotId ? (
              <SwapForm
                pick={pick}
                label={labels.get(pick.slotId) ?? pick.slotId}
                busy={locked}
                onRevise={onRevise}
                onSwap={onSwap}
                onClose={() => setSwapping(null)}
              />
            ) : null
          }
        />

        <div className="ip-revise-day">
          <label htmlFor="ip-revise-day">Ask for a different version of the whole day</label>
          <textarea
            id="ip-revise-day"
            rows={2}
            value={dayChange}
            placeholder="More time by the sea, a cheaper dinner, nothing before 10…"
            onChange={event => setDayChange(event.target.value)}
          />
          <div className="ip-step-actions">
            <button
              type="button"
              className="ip-button-quiet"
              disabled={locked || !dayChange.trim()}
              onClick={() => {
                onRevise(dayChange.trim())
                setDayChange('')
              }}
            >
              <RefreshCw size={14} aria-hidden /> Revise the day
            </button>
            <span className="ip-helper">One call. You see the new version before it replaces this one.</span>
          </div>
        </div>

        {history.length > 1 || previous ? (
          <details className="ip-disclosure">
            <summary>
              Earlier versions <span className="ip-disclosure-note">{history.length} saved</span>
            </summary>
            <ul className="ip-agenda-list">
              {history.map(row => (
                <li key={row.revision}>
                  {row.revision === proposal.revision ? 'Now: ' : ''}
                  Version {row.revision} · {whenWords(row.saved_at)}
                  {row.kind === 'previous' ? ' · older article format' : ''}
                  {row.origin === 'editor_swap' ? ' · your edit' : ''} — {row.headline || 'untitled'}
                </li>
              ))}
            </ul>
            {previous ? <PreviousVersion previous={previous} slots={slots} /> : null}
          </details>
        ) : null}
      </div>
    </Step>
  )
}

/** A day saved in the older article format: readable, not built on. */
export function PreviousVersion({
  previous,
  slots,
}: {
  previous: PreviousVersionView
  slots: DaySlotView[]
}) {
  const labels = new Map(slots.map(slot => [slot.id, slot.label]))
  return (
    <details className="ip-disclosure ip-previous">
      <summary>
        Previous version: {previous.title || 'untitled'}{' '}
        <span className="ip-disclosure-note">
          older article format · {whenWords(previous.saved_at)}
        </span>
      </summary>
      <p className="ip-helper">
        Saved before places were chosen this way. Kept to reread; nothing new is built from it.
      </p>
      {previous.intro ? <p className="ip-context-text">{previous.intro}</p> : null}
      <ol className="ip-slot-directions">
        {previous.stops.map(stop => (
          <li key={stop.slot_id}>
            <p className="ip-slot-direction-head">
              {labels.get(stop.slot_id) ?? stop.slot_id}
              <span className="ip-slot-direction-role">{stop.name ?? stop.status.replace('_', ' ')}</span>
            </p>
            {stop.copy ? <p className="ip-context-text">{stop.copy}</p> : null}
          </li>
        ))}
      </ol>
    </details>
  )
}
