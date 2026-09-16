import { AlertTriangle, ArrowRight, Check, Loader2 } from 'lucide-react'
import type { DayState, DayWorkView } from '../../dayWork/types'

/**
 * Where the day stands, answered before anything else on the screen.
 *
 * Four stages — interview, summary, choose places, proposal — and one line
 * saying what needs the editor now. Read off the server's word for the day;
 * nothing here is stored.
 */

type Mark = 'done' | 'current' | 'upcoming' | 'attention'

export interface DayProgressProps {
  state: DayState
  day: DayWorkView | null
  researching: boolean
  /** An answer for the current request is waiting to be saved. */
  answerWaiting: boolean
}

interface Status {
  headline: string
  next: string | null
  tone: 'neutral' | 'working' | 'attention' | 'done'
}

function dayStatus({ state, day, researching, answerWaiting }: DayProgressProps): Status {
  if (researching) {
    return {
      headline: 'Choosing places',
      next: 'Nothing to do yet. This takes a few minutes; the answer will be waiting here.',
      tone: 'working',
    }
  }
  if (answerWaiting) {
    return {
      headline: 'New places are back — not saved yet',
      next: 'Look at them below, then save.',
      tone: 'attention',
    }
  }
  const questions = day?.proposal?.selection.questions.length ?? 0
  switch (state) {
    case 'layout_needs_review':
      return {
        headline: 'Layout needs approving',
        next: 'Use Edit layouts to review and approve this day.',
        tone: 'attention',
      }
    case 'ready_to_start':
      return {
        headline: 'Not started',
        next: 'Start the interview: a short conversation about what this day is for.',
        tone: 'neutral',
      }
    case 'grill_asking':
      return { headline: 'Interview in progress', next: 'Answer the question below.', tone: 'neutral' }
    case 'agreed':
      return {
        headline: 'Interview agreed',
        next: 'Write down the summary — one short call that records what was agreed.',
        tone: 'neutral',
      }
    case 'direction_review':
      return { headline: 'Summary ready', next: 'Read it, then agree.', tone: 'neutral' }
    case 'direction_outdated':
      return {
        headline: 'Agreed in the older format',
        next: 'Write the short summary from the same conversation, then choose places.',
        tone: 'attention',
      }
    case 'direction_accepted':
      return {
        headline: 'Summary agreed',
        next: 'Build the request. It is free.',
        tone: 'neutral',
      }
    case 'prompt_ready':
      return {
        headline: 'Ready to choose places',
        next: 'Choose places here, or copy the request and paste the answer back.',
        tone: 'neutral',
      }
    case 'context_changed':
      return {
        headline: 'This day changed',
        next: 'Rebuild the request so it matches the day as it is now.',
        tone: 'attention',
      }
    case 'proposal_open':
      return {
        headline: questions > 0 ? 'Proposal — needs your decision' : 'Proposal — a stop is open',
        next:
          questions > 0
            ? 'Answer the question below, or fill the stop yourself.'
            : 'Fill the open stop, or ask for a revised day.',
        tone: 'attention',
      }
    case 'proposal_ready':
      return day?.proposal?.stale
        ? {
            headline: 'Proposal — the trip changed since',
            next: 'Check what changed below, and refresh the proposal if it matters.',
            tone: 'attention',
          }
        : {
            headline: 'Proposal ready',
            next: 'Keep the places, swap any you would change, or ask for a revised day.',
            tone: 'done',
          }
  }
}

function marks({ state, day, researching, answerWaiting }: DayProgressProps): Mark[] {
  if (state === 'layout_needs_review') return ['upcoming', 'upcoming', 'upcoming', 'upcoming']
  const agreed = day?.grill?.status === 'agreed'
  const summarised =
    Boolean(day?.accepted_direction) && !day?.candidate_direction && state !== 'direction_outdated'
  const proposed = Boolean(day?.proposal)
  const interview: Mark = agreed || summarised ? 'done' : 'current'
  const summary: Mark =
    state === 'direction_outdated'
      ? 'attention'
      : summarised
        ? 'done'
        : interview === 'done'
          ? 'current'
          : 'upcoming'
  const choose: Mark =
    state === 'context_changed'
      ? 'attention'
      : researching
        ? 'current'
        : proposed || answerWaiting
          ? 'done'
          : summary === 'done'
            ? 'current'
            : 'upcoming'
  const proposal: Mark = answerWaiting
    ? 'current'
    : state === 'proposal_open'
      ? 'attention'
      : proposed
        ? 'done'
        : 'upcoming'
  return [interview, summary, choose, proposal]
}

const STAGES = ['Interview', 'Summary', 'Choose places', 'Proposal']

const MARK_WORDS: Record<Mark, string> = {
  done: 'done',
  current: 'current step',
  upcoming: 'not yet',
  attention: 'needs attention',
}

export function DayProgress(props: DayProgressProps) {
  const status = dayStatus(props)
  const stageMarks = marks(props)
  return (
    <div className="ip-progress-wrap">
      <ol className="ip-progress" aria-label="Where this day stands">
        {STAGES.map((stage, index) => {
          const mark = stageMarks[index]
          return (
            <li
              key={stage}
              className={`ip-progress-stage ip-progress-${mark}`}
              aria-current={mark === 'current' ? 'step' : undefined}
            >
              <span className="ip-progress-dot" aria-hidden>
                {mark === 'done' ? (
                  <Check size={12} />
                ) : mark === 'attention' ? (
                  <AlertTriangle size={11} />
                ) : mark === 'current' && props.researching && index === 2 ? (
                  <Loader2 size={12} className="ip-spin" />
                ) : (
                  index + 1
                )}
              </span>
              <span className="ip-progress-label">{stage}</span>
              <span className="ip-sr-only"> — {MARK_WORDS[mark]}</span>
            </li>
          )
        })}
      </ol>

      <div className={`ip-status ip-status-${status.tone}`} role="status">
        <p className="ip-status-headline">{status.headline}</p>
        {status.next ? (
          <p className="ip-status-next">
            <ArrowRight size={14} aria-hidden />
            <span>
              <strong>Next:</strong> {status.next}
            </span>
          </p>
        ) : null}
      </div>
    </div>
  )
}
