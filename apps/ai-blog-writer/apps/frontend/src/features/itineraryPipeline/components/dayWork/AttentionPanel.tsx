import { AlertTriangle, Info, Lightbulb } from 'lucide-react'
import type { Attention, AttentionItem } from './attention'

/**
 * The three kinds of "look at this", kept visibly apart.
 *
 * What keeps the day open is listed in full and styled as the only urgent
 * thing. Suggestions and caveats are counted and folded: they are worth
 * reading once, and they are not a to-do list. A day with nothing blocking
 * says so first, so a list of suggestions cannot read as a list of failures.
 */

function Items({ items, tone }: { items: AttentionItem[]; tone: 'block' | 'suggest' | 'note' }) {
  return (
    <ul className={`ip-attn-list ip-attn-list-${tone}`}>
      {items.map(entry => (
        <li key={entry.text}>
          {entry.venue ? <span className="ip-attn-venue">{entry.venue}</span> : null}
          <span>{entry.text}</span>
          {entry.detail ? <span className="ip-attn-detail">{entry.detail}</span> : null}
        </li>
      ))}
    </ul>
  )
}

export function AttentionPanel({
  attention,
  headingId,
  savedWord,
}: {
  attention: Attention
  headingId: string
  /** How the day is kept: "saved" for a saved day, "can still be saved" for a preview. */
  savedWord: string
}) {
  const { blocking, proposals, caveats } = attention
  if (blocking.length + proposals.length + caveats.length === 0) return null
  const open = blocking.length > 0
  return (
    <section
      className={open ? 'ip-attention ip-attention-open' : 'ip-attention'}
      aria-labelledby={headingId}
    >
      <h4 className="ip-attention-title" id={headingId}>
        {open ? (
          <>
            <AlertTriangle size={16} aria-hidden /> Needs your attention
          </>
        ) : (
          <>
            <Info size={16} aria-hidden /> Nothing blocks this day
          </>
        )}
      </h4>
      <p className="ip-attention-lead">
        {open
          ? `${blocking.length} issue${blocking.length === 1 ? '' : 's'} keep${blocking.length === 1 ? 's' : ''} this day from being complete for planning. The day ${savedWord} as it is. Nothing here is fixed automatically.`
          : 'Everything required is in place. What follows is optional reading.'}
      </p>

      {open ? (
        <>
          <p className="ip-attention-kind">Keeps the day open</p>
          <Items items={blocking} tone="block" />
        </>
      ) : null}

      {proposals.length > 0 ? (
        <details className="ip-attn-fold">
          <summary>
            <Lightbulb size={15} aria-hidden />
            <span className="ip-attention-kind">Changes it proposes</span>
            <span className="ip-disclosure-note">
              {proposals.length} optional · none applied
            </span>
          </summary>
          <p className="ip-helper">
            Suggestions from the research. The day above does not include them,
            and nothing here applies them — act on one by changing the plan
            yourself.
          </p>
          <Items items={proposals} tone="suggest" />
        </details>
      ) : null}

      {caveats.length > 0 ? (
        <details className="ip-attn-fold">
          <summary>
            <Info size={15} aria-hidden />
            <span className="ip-attention-kind">Caveats</span>
            <span className="ip-disclosure-note">
              {caveats.length} · none of these keeps the day open
            </span>
          </summary>
          <Items items={caveats} tone="note" />
        </details>
      ) : null}
    </section>
  )
}
