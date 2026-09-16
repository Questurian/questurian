import { AlertTriangle, Check, RefreshCw } from 'lucide-react'
import { Badge, Step } from './Step'
import { isSummary } from '../../dayWork/types'
import type { DaySlotView, DirectionRevision, OlderDirection } from '../../dayWork/types'

/**
 * The agreed day, written down short, before it is accepted.
 *
 * The conversation ends in a paragraph. A second pass writes it down as a
 * summary the selection works from: the angle, how the day fits the trip, the
 * area, and each stop's role — with the operator's firm requirements shown
 * apart from preferences the selection may bend. It is shown here exactly as
 * it will be used, and accepted by revision number.
 *
 * A day agreed under the older, long format shows that agreement as history
 * and offers to write the short summary from the same conversation. Nothing
 * is rewritten on its own.
 */

export interface DayDirectionReviewProps {
  candidate: DirectionRevision | null
  accepted: DirectionRevision | null
  slots: DaySlotView[]
  tone: 'waiting' | 'active' | 'done'
  busy: boolean
  canPrepare: boolean
  onPrepare: () => void
  onAccept: (revision: number) => void
}

function Items({ title, items, tone }: { title: string; items: string[]; tone?: string }) {
  if (items.length === 0) return null
  return (
    <div className="ip-direction-block">
      <h4>{title}</h4>
      <ul className={tone ? `ip-criteria ${tone}` : 'ip-criteria'}>
        {items.map(item => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  )
}

function Trace({ turns }: { turns: OlderDirection['agreement_trace'] }) {
  if (turns.length === 0) return null
  return (
    <details className="ip-disclosure">
      <summary>
        How this was agreed{' '}
        <span className="ip-disclosure-note">{turns.length} decisions</span>
      </summary>
      <ol className="ip-slot-directions">
        {turns.map((turn, index) => (
          <li key={`${index}-${turn.decision}`}>
            <p className="ip-slot-direction-head">{turn.decision}</p>
            <p className="ip-context-text">{turn.answer}</p>
            <p className="ip-helper">
              {turn.answer_origin === 'accepted_recommendation'
                ? 'You accepted the suggestion unchanged, so it counts as a preference.'
                : 'You answered in your own words.'}
            </p>
          </li>
        ))}
      </ol>
    </details>
  )
}

export function DayDirectionReview({
  candidate,
  accepted,
  slots,
  tone,
  busy,
  canPrepare,
  onPrepare,
  onAccept,
}: DayDirectionReviewProps) {
  const showing = candidate ?? accepted
  const isAccepted = !candidate && Boolean(accepted)
  const labels = new Map(slots.map(slot => [slot.id, slot.label]))

  const writeAgain = (
    <button type="button" className="ip-button-quiet" onClick={onPrepare} disabled={busy}>
      <RefreshCw size={15} aria-hidden /> Write it down again
    </button>
  )

  if (!showing) {
    return (
      <Step
        id="ip-direction"
        title="Summary"
        tone={tone}
        badge={<Badge tone="quiet">Not written yet</Badge>}
        lead="The conversation, written down short: what the day is for, where it happens, each stop's role, and which of your wishes are firm."
        actions={
          <>
            <button
              type="button"
              className="ip-button-primary"
              onClick={onPrepare}
              disabled={busy || !canPrepare}
            >
              {busy ? 'Writing it down…' : 'Write down the summary'}
            </button>
            <span className="ip-helper">
              {canPrepare
                ? 'One short model call. It only records what was agreed.'
                : 'Available once the interview has agreed.'}
            </span>
          </>
        }
      />
    )
  }

  const direction = showing.direction
  if (!isSummary(direction)) {
    // The older, long agreement: kept readable, never built from.
    return (
      <Step
        id="ip-direction"
        title="Summary"
        tone={tone}
        badge={<Badge tone="warning">Older format</Badge>}
        lead="This day was agreed in the older, longer format, which asked research to prove every detail. Write the short summary from the same conversation to choose places."
        actions={
          <>
            <button
              type="button"
              className="ip-button-primary"
              onClick={onPrepare}
              disabled={busy || !canPrepare}
            >
              <RefreshCw size={15} aria-hidden />
              {busy ? 'Writing it down…' : 'Write the short summary'}
            </button>
            <span className="ip-helper">
              {canPrepare
                ? 'One short model call. The conversation is not repeated.'
                : 'The interview has to be agreed first.'}
            </span>
          </>
        }
      >
        <p className="ip-unchecked" role="status">
          <AlertTriangle size={16} aria-hidden /> Nothing new is built from this version.
        </p>
        <p className="ip-direction-promise">{direction.promise}</p>
        <Trace turns={direction.agreement_trace} />
      </Step>
    )
  }

  const roles = direction.slots.filter(
    entry => entry.role || entry.requirements.length || entry.preferences.length,
  )
  return (
    <Step
      id="ip-direction"
      title="Summary"
      tone={tone}
      badge={
        isAccepted ? (
          <Badge tone="done">Accepted · version {showing.revision}</Badge>
        ) : (
          <Badge>Read before accepting</Badge>
        )
      }
      lead={
        isAccepted
          ? 'Places are chosen from this.'
          : 'What was agreed, short. Firm requirements must be met; preferences may bend.'
      }
      actions={
        isAccepted ? (
          <>
            {writeAgain}
            <span className="ip-helper">Only if the conversation has moved on.</span>
          </>
        ) : (
          <>
            <button
              type="button"
              className="ip-button-primary"
              onClick={() => onAccept(showing.revision)}
              disabled={busy}
            >
              <Check size={16} aria-hidden /> Agree
            </button>
            {writeAgain}
            <span className="ip-helper">Accepting is free.</span>
          </>
        )
      }
    >
      <div className="ip-direction">
        <p className="ip-direction-promise">{direction.angle}</p>
        {direction.trip_fit ? <p className="ip-context-text">{direction.trip_fit}</p> : null}
        {direction.area ? (
          <p className="ip-context-text">
            <strong>Where:</strong> {direction.area}
          </p>
        ) : null}

        <div className="ip-direction-grid">
          <Items title="Firm requirements" items={direction.requirements} />
          <Items title="Preferences" items={direction.preferences} tone="ip-criteria-soft" />
          <Items title="Avoid" items={direction.avoid} tone="ip-criteria-out" />
        </div>

        {roles.length > 0 ? (
          <div>
            <h4 className="ip-issue-group">The stops</h4>
            <ol className="ip-slot-directions">
              {roles.map(entry => (
                <li key={entry.slot_id}>
                  <p className="ip-slot-direction-head">
                    {labels.get(entry.slot_id) ?? entry.slot_id}
                    <span className="ip-slot-direction-role">{entry.role}</span>
                  </p>
                  {entry.requirements.length > 0 ? (
                    <ul className="ip-criteria">
                      {entry.requirements.map(item => (
                        <li key={item}>must: {item}</li>
                      ))}
                    </ul>
                  ) : null}
                  {entry.preferences.length > 0 ? (
                    <ul className="ip-criteria ip-criteria-soft">
                      {entry.preferences.map(item => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        <Trace turns={direction.agreement_trace} />
      </div>
    </Step>
  )
}
