import { AlertTriangle, ArrowRight, Check, Loader2 } from 'lucide-react'
import type { DayState, DayWorkView } from '../../dayWork/types'

/**
 * Where the day stands, answered before anything else on the screen.
 *
 * A five-stage track (interview → direction → research → review and save →
 * ready for planning) says where you are, and one callout says what has
 * happened, what needs you now, and what the next action does. Both are read
 * off the server's word for the day and the artifacts it returned — nothing
 * here is stored, so the track cannot disagree with the steps below it.
 *
 * "Ready for planning" is the server's completeness verdict and nothing more.
 * It never implies the sources were read or that anything was published.
 */

type Mark = 'done' | 'current' | 'upcoming' | 'attention'

export interface DayProgressProps {
  state: DayState
  day: DayWorkView | null
  researching: boolean
  /** A research answer for the current prompt is waiting to be saved. */
  answerWaiting: boolean
  /** How many things keep a saved day open. */
  blockingCount: number
}

interface Status {
  headline: string
  detail: string
  next: string | null
  tone: 'neutral' | 'working' | 'attention' | 'done'
}

export function dayStatus({
  state,
  day,
  researching,
  answerWaiting,
  blockingCount,
}: DayProgressProps): Status {
  const reviewed = Boolean(day?.review.evidence_reviewed)
  switch (state) {
    case 'layout_needs_review':
      return {
        headline: 'Layout needs approving',
        detail: 'This layout needs approving again before anything can start.',
        next: 'Use Edit layouts to review and approve this day.',
        tone: 'attention',
      }
    case 'ready_to_start':
      return {
        headline: 'Not started',
        detail: 'Nothing has been decided about this day yet.',
        next: 'Start the day Grill. It is a short interview that settles what this day is for; nothing is researched yet.',
        tone: 'neutral',
      }
    case 'grill_asking':
      return {
        headline: 'Interview in progress',
        detail: 'The interview is waiting on you.',
        next: 'Answer the question below. When every topic is settled, the interview proposes a summary for you to agree to.',
        tone: 'neutral',
      }
    case 'agreed':
      return {
        headline: 'Interview agreed',
        detail: 'The interview agreed. Write the direction down next.',
        next: 'Write down the direction — one model call that records the agreement as requirements. It adds nothing new.',
        tone: 'neutral',
      }
    case 'direction_review':
      return {
        headline: 'Direction ready to review',
        detail: 'Read the direction, then accept it.',
        next: 'Accepting is free and makes this the brief that research works from.',
        tone: 'neutral',
      }
    case 'direction_accepted':
      return {
        headline: 'Ready to build the research prompt',
        detail: 'The direction is settled. Build the prompt next.',
        next: 'Build the research prompt. It is free and calls no model.',
        tone: 'neutral',
      }
    case 'prompt_ready':
      if (researching) {
        return {
          headline: 'Research running',
          detail: 'The research call is out: it looks places up and writes the day in one go.',
          next: 'Nothing to do yet. This takes several minutes; you can leave the screen and the answer will be waiting here.',
          tone: 'working',
        }
      }
      if (answerWaiting) {
        return {
          headline: 'Research returned — not saved yet',
          detail: 'The answer is back and the app has checked it.',
          next: 'Read the day below, then save it. Saving is allowed even if something is still open.',
          tone: 'attention',
        }
      }
      return {
        headline: 'Ready to research',
        detail: 'Take the prompt to a research tool, then bring the answer back.',
        next: 'Research this day here (one call, several minutes), or copy the prompt, run it elsewhere and paste the answer back.',
        tone: 'neutral',
      }
    case 'context_changed':
      return {
        headline: 'This day changed',
        detail: 'This day changed. Outstanding work needs reviewing before it is used.',
        next: 'Rebuild the research prompt so it matches the day as it is now. Anything already saved is kept.',
        tone: 'attention',
      }
    case 'saved_needs_work':
      return {
        headline: 'Saved — not ready for planning',
        detail:
          blockingCount > 0
            ? `A day is saved and is not finished: its places and paragraphs are kept, and ${blockingCount} issue${blockingCount === 1 ? '' : 's'} still keep${blockingCount === 1 ? 's' : ''} it open.`
            : 'A day is saved and is not finished.',
        next: 'Decide what to do about each open issue below. Nothing here fixes them: to change the plan, reopen the interview or research again, then save the new answer.',
        tone: 'attention',
      }
    case 'saved_complete':
      return {
        headline: 'Complete for planning',
        detail: reviewed
          ? 'A day is saved and every stop is chosen and timed. You marked its sources as read.'
          : 'A day is saved. Its facts are still unchecked.',
        next: reviewed
          ? null
          : 'Read the day and check its sources, then record that in Your review.',
        tone: 'done',
      }
  }
}

function marks(props: DayProgressProps): Mark[] {
  const { state, day, researching, answerWaiting } = props
  const agreed = day?.grill?.status === 'agreed'
  const accepted = Boolean(day?.accepted_direction) && !day?.candidate_direction
  const saved = Boolean(day?.result)
  const complete = state === 'saved_complete'
  const answered = saved || answerWaiting

  const interview: Mark = agreed || accepted ? 'done' : 'current'
  const direction: Mark = accepted ? 'done' : interview === 'done' ? 'current' : 'upcoming'
  const research: Mark =
    state === 'context_changed'
      ? 'attention'
      : answered && !researching
        ? 'done'
        : direction === 'done'
          ? 'current'
          : 'upcoming'
  const save: Mark = saved ? 'done' : answerWaiting ? 'current' : 'upcoming'
  const ready: Mark = complete ? 'done' : saved ? 'attention' : 'upcoming'
  if (state === 'layout_needs_review') return ['upcoming', 'upcoming', 'upcoming', 'upcoming', 'upcoming']
  return [interview, direction, research, save, ready]
}

const STAGES = ['Interview', 'Direction', 'Research', 'Review & save', 'Ready for planning']

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
        <p className="ip-status-detail">{status.detail}</p>
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
