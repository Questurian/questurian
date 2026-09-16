import { useState, type ReactNode } from 'react'
import { Check, ChevronDown } from 'lucide-react'

/**
 * One step of the day's work, as a card.
 *
 * The four panels share this shell so the day reads as one sequence rather
 * than as four screens that happen to be stacked. Exactly one step is `active`
 * at a time — the one the operator is meant to act on — and it is the only one
 * with the accent border, so "what now" is answered by looking rather than by
 * reading every card in turn.
 *
 * Steps that are finished, or that are an alternative to the live one, sit
 * inside a `StageFold`: one line saying what happened, opened on request. The
 * step stays mounted while folded, so nothing typed into it is lost.
 */

export type StepTone = 'waiting' | 'active' | 'done' | 'result'

export interface StepProps {
  /** The small uppercase eyebrow. A noun, not a sentence. */
  title: string
  tone: StepTone
  /** Shown beside the title: what this step's state is, in two or three words. */
  badge?: ReactNode
  /** One sentence saying what this step is for. */
  lead?: ReactNode
  children?: ReactNode
  actions?: ReactNode
  /** Set when the panel needs to be announced or scrolled to. */
  id?: string
}

const TONE_CLASS: Record<StepTone, string> = {
  waiting: 'ip-step',
  active: 'ip-step ip-step-active',
  done: 'ip-step ip-step-done',
  result: 'ip-step ip-step-result',
}

export function Step({ title, tone, badge, lead, children, actions, id }: StepProps) {
  const headingId = id ? `${id}-heading` : undefined
  return (
    <section className={TONE_CLASS[tone]} id={id} aria-labelledby={headingId}>
      <div className="ip-step-head">
        <h3 id={headingId}>{title}</h3>
        {badge}
      </div>
      {lead ? <p className="ip-step-lead">{lead}</p> : null}
      {children}
      {actions ? <div className="ip-step-actions">{actions}</div> : null}
    </section>
  )
}

export function Badge({
  tone = 'accent',
  children,
}: {
  tone?: 'accent' | 'done' | 'warning' | 'error' | 'quiet'
  children: ReactNode
}) {
  const suffix = tone === 'accent' ? '' : ` ip-badge-${tone}`
  return <span className={`ip-badge${suffix}`}>{children}</span>
}

export function StageFold({
  label,
  summary,
  done,
  defaultOpen = false,
  children,
}: {
  label: string
  /** What happened in this stage, in a few words. */
  summary: ReactNode
  /** A finished stage gets a tick; an optional alternative does not. */
  done: boolean
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <details
      className="ip-fold"
      open={open}
      onToggle={event => setOpen((event.currentTarget as HTMLDetailsElement).open)}
    >
      <summary>
        <span className={done ? 'ip-fold-mark ip-fold-mark-done' : 'ip-fold-mark'} aria-hidden>
          {done ? <Check size={12} /> : null}
        </span>
        <span className="ip-fold-label">{label}</span>
        <span className="ip-fold-summary">{summary}</span>
        <span className="ip-fold-toggle">
          {open ? 'Hide' : 'Show'} <ChevronDown size={14} aria-hidden />
        </span>
      </summary>
      <div className="ip-fold-body">{children}</div>
    </details>
  )
}
