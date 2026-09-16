import { Check, RefreshCw } from 'lucide-react'
import { Badge, Step } from './Step'
import type { DaySlotView, DirectionRevision } from '../../dayWork/types'

/**
 * The agreed direction, shown as the object it is before it is accepted.
 *
 * The conversation ends in a paragraph, and a paragraph is the right thing to
 * agree to. It is not the right thing to research from: it cannot be checked
 * against the stop list and it cannot be hashed into a prompt. So a second
 * pass writes the same agreement down as a structured object — and that object
 * is shown here, exactly as it will be sent, before anybody accepts it.
 *
 * "Agree and prepare prompt" accepts the revision on screen, by number. A
 * second extraction landing between the render and the click would otherwise
 * be accepted without ever having been read.
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

function List({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null
  return (
    <div className="ip-direction-block">
      <h4>{title}</h4>
      <ul>
        {items.map(item => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  )
}

function Lines({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  const filled = rows.filter(([, value]) => value.trim())
  if (filled.length === 0) return null
  return (
    <div className="ip-direction-block">
      <h4>{title}</h4>
      {filled.map(([label, value]) => (
        <p key={label}>
          <strong>{label}:</strong> {value}
        </p>
      ))}
    </div>
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

  if (!showing) {
    return (
      <Step
        id="ip-direction"
        title="Direction"
        tone={tone}
        badge={<Badge tone="quiet">Not written yet</Badge>}
        lead="The conversation, written down as the requirements research will work from — purpose, area, what every stop is for, and the factual questions that still need answering."
        actions={
          <>
            <button
              type="button"
              className="ip-button-primary"
              onClick={onPrepare}
              disabled={busy || !canPrepare}
            >
              {busy ? 'Writing it down…' : 'Write down the direction'}
            </button>
            <span className="ip-helper">
              {canPrepare
                ? 'One more model call. It adds nothing — it only records what was agreed.'
                : 'Available once the interview has agreed.'}
            </span>
          </>
        }
      />
    )
  }

  const direction = showing.direction
  return (
    <Step
      id="ip-direction"
      title="Direction"
      tone={tone}
      badge={
        isAccepted ? (
          <Badge tone="done">Accepted · revision {showing.revision}</Badge>
        ) : (
          <Badge>Read this before accepting</Badge>
        )
      }
      lead={
        isAccepted
          ? 'This is what the research prompt is built from.'
          : 'The interview, written down as requirements. This is exactly what will be sent to research. Read it; accepting it is what makes it the requirements.'
      }
      actions={
        isAccepted ? (
          <>
            <button
              type="button"
              className="ip-button-quiet"
              onClick={onPrepare}
              disabled={busy}
            >
              <RefreshCw size={15} aria-hidden /> Write it down again
            </button>
            <span className="ip-helper">
              Only if the conversation has moved on. A new version has to be
              accepted before it is used.
            </span>
          </>
        ) : (
          <>
            <button
              type="button"
              className="ip-button-primary"
              onClick={() => onAccept(showing.revision)}
              disabled={busy}
            >
              <Check size={16} aria-hidden /> Agree and prepare the prompt
            </button>
            <button
              type="button"
              className="ip-button-quiet"
              onClick={onPrepare}
              disabled={busy}
            >
              <RefreshCw size={15} aria-hidden /> Write it down again
            </button>
            <span className="ip-helper">
              Open &ldquo;Full requirements&rdquo; before accepting — it is part of
              what is sent. Accepting is free. Research will work from this version; you can
              write it down again later, and a new version needs accepting too.
            </span>
          </>
        )
      }
    >
      <div className="ip-direction">
        <p className="ip-direction-promise">{direction.promise}</p>

        <div>
          <h4 className="ip-issue-group">What each stop is for</h4>
          <ol className="ip-slot-directions">
            {direction.slot_directions.map(entry => (
              <li key={entry.slot_id}>
                <p className="ip-slot-direction-head">
                  {labels.get(entry.slot_id) ?? entry.slot_id}
                  <span className="ip-slot-direction-role">{entry.role}</span>
                </p>
                {entry.must_have.length > 0 ? (
                  <ul className="ip-criteria">
                    {entry.must_have.map(item => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
                {entry.nice_to_have.length > 0 ? (
                  <ul className="ip-criteria ip-criteria-soft">
                    {entry.nice_to_have.map(item => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
                {entry.exclusions.length > 0 ? (
                  <ul className="ip-criteria ip-criteria-out">
                    {entry.exclusions.map(item => (
                      <li key={item}>not: {item}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ol>
        </div>

        <List title="This day is wrong if" items={direction.fails_if} />

        <details className="ip-disclosure">
          <summary>
            Full requirements{' '}
            <span className="ip-disclosure-note">
              area, rhythm, constraints{direction.research_checklist.length > 0
                ? ` · ${direction.research_checklist.length} questions for research`
                : ''}
            </span>
          </summary>
          <div className="ip-direction-grid">
            <Lines
              title="This day's part in the trip"
              rows={[['Role', direction.trip_role]]}
            />
            <Lines
              title="Geography"
              rows={[
                ['Area', direction.geography.required_area],
                ['Starts from', direction.geography.starting_point],
                ['Progression', direction.geography.progression],
                ['Transfers', direction.geography.transfer_tolerance],
              ]}
            />
            <Lines
              title="Rhythm"
              rows={[
                ['Effort', direction.rhythm.effort],
                ['Meals', direction.rhythm.meal_balance],
                ['Rest', direction.rhythm.rest_policy],
                [
                  'Minimum rest',
                  direction.rhythm.rest_minutes_minimum
                    ? `${direction.rhythm.rest_minutes_minimum} minutes`
                    : '',
                ],
                ['Optional', direction.rhythm.optionality],
              ]}
            />
            <List title="What drives the day" items={direction.anchors} />
            <List title="Staying out of" items={direction.geography.avoid_today} />
            <List title="Constraints" items={direction.constraints} />
            <List
              title="Covered by other days"
              items={direction.continuity.covered_elsewhere}
            />
            <List
              title="Reserved for later days"
              items={direction.continuity.reserved_for_later}
            />
            <Lines
              title="What may change"
              rows={[
                ['Must stay', direction.change_policy.must_remain],
                ['May be proposed', direction.change_policy.may_be_proposed],
              ]}
            />
          </div>

          {direction.research_checklist.length > 0 ? (
            <div className="ip-direction-block">
              <h4>What research has to answer</h4>
              <ul>
                {direction.research_checklist.map(item => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

        </details>

        {direction.agreement_trace.length > 0 ? (
          <details className="ip-disclosure">
            <summary>
              How this was agreed{' '}
              <span className="ip-disclosure-note">
                {direction.agreement_trace.length} decisions
              </span>
            </summary>
            <ol className="ip-slot-directions">
              {direction.agreement_trace.map((turn, index) => (
                <li key={`${index}-${turn.decision}`}>
                  <p className="ip-slot-direction-head">{turn.decision}</p>
                  <p className="ip-context-text">{turn.answer}</p>
                  <p className="ip-helper">
                    {turn.answer_origin === 'accepted_recommendation'
                      ? // Kept visible because it changes what the answer is
                        // worth downstream: an accepted suggestion is a
                        // decision, and it is not first-hand knowledge.
                        'You accepted the suggestion unchanged.'
                      : 'You answered in your own words.'}
                  </p>
                </li>
              ))}
            </ol>
          </details>
        ) : null}
      </div>
    </Step>
  )
}
