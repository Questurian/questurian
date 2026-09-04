import { useEffect, useMemo, useState } from 'react'
import type { ListicleGrillOption } from '../types'

/**
 * The angle question, answered by choosing rather than by writing.
 *
 * Every other question in this interview is a sentence, and a text box is the
 * right control for a sentence. This one is not: each line becomes a literal
 * web search, run separately, and the list of them IS the search order. Asked
 * as prose it comes back as prose and has to be split apart again -- and
 * splitting is exactly where the wording gets mangled, which is the thing that
 * empties a search.
 *
 * It is a menu, not a summary of what was chosen. The recommended angles
 * arrive ticked and the rest arrive unticked, because a screen showing only
 * the six it picked cannot be argued with -- there is nothing visible to swap
 * in, and "no" is not an answer the interview can act on.
 *
 * Editing is allowed on every line, ticked or not. The rule these are written
 * under is that an angle must not carry conditions its shape did not ask for,
 * and a model that has just broken that rule will not notice it did. Someone
 * reading "opened in the last year AND has significant buzz" is the only check
 * there is.
 */

export interface AnglePickerProps {
  options: ListicleGrillOption[]
  busy: boolean
  onSend: (answer: string) => void
}

interface Choice extends ListicleGrillOption {
  keep: boolean
}

export function AnglePicker({ options, busy, onSend }: AnglePickerProps) {
  const [choices, setChoices] = useState<Choice[]>([])

  // A new question replaces the list outright. Carrying edits across questions
  // would silently answer the new one with the old one's lines.
  useEffect(() => {
    setChoices(options.map(option => ({ ...option, keep: option.recommended })))
  }, [options])

  const kept = choices.filter(choice => choice.keep && choice.text.trim())
  const answer = kept.map(choice => choice.text.trim()).join('\n')

  // Two ticked angles from one group run two searches that come back with the
  // same places. Said, not enforced: the operator knows the city, and this is
  // a default rather than a law.
  const clashes = useMemo(() => {
    const counts = new Map<string, number>()
    for (const choice of kept) {
      if (choice.group) counts.set(choice.group, (counts.get(choice.group) ?? 0) + 1)
    }
    return [...counts].filter(([, count]) => count > 1).map(([group]) => group)
  }, [kept])

  function update(index: number, patch: Partial<Choice>) {
    setChoices(current =>
      current.map((choice, at) => (at === index ? { ...choice, ...patch } : choice)),
    )
  }

  function row(choice: Choice, index: number) {
    return (
      // Index-keyed on purpose: rows are edited in place and never reordered,
      // and the text itself changes as it is typed.
      <li
        key={index}
        className={choice.keep ? 'lp-picker-row' : 'lp-picker-row lp-picker-row-off'}
      >
        <input
          type="checkbox"
          checked={choice.keep}
          disabled={busy}
          aria-label={`Search for ${choice.text}`}
          onChange={event => update(index, { keep: event.target.checked })}
        />
        <textarea
          value={choice.text}
          rows={2}
          disabled={busy}
          onChange={event => update(index, { text: event.target.value })}
        />
        {choice.group && <span className="lp-picker-group">{choice.group}</span>}
      </li>
    )
  }

  const picks = choices.map((choice, index) => [choice, index] as const)
  const recommended = picks.filter(([choice]) => choice.recommended)
  const alternates = picks.filter(([choice]) => !choice.recommended)

  return (
    <div className="lp-picker">
      <p className="lp-picker-hint">
        These are the searches. Untick what you don&apos;t want, edit the wording, or
        take one from below.
      </p>

      <ul className="lp-picker-list">{recommended.map(([choice, index]) => row(choice, index))}</ul>

      {alternates.length > 0 && (
        <>
          <p className="lp-picker-heading">
            Other angles for this list &mdash; tick any to add
          </p>
          <ul className="lp-picker-list">
            {alternates.map(([choice, index]) => row(choice, index))}
          </ul>
        </>
      )}

      {clashes.length > 0 && (
        <p className="lp-picker-warning" role="status">
          Two ticked angles are both <strong>{clashes.join(' and ')}</strong>. They tend
          to return the same places, so one of them is probably a wasted search.
        </p>
      )}

      <div className="lp-picker-actions">
        <button
          type="button"
          className="lp-secondary"
          disabled={busy}
          onClick={() =>
            setChoices(current => [
              ...current,
              { text: '', recommended: true, group: '', keep: true },
            ])
          }
        >
          Add an angle
        </button>
        <span className="lp-picker-count">
          {/* The honest progress signal: roughly seven items come from each
              search, so this number is what decides whether the list can reach
              its target at all. */}
          {kept.length} {kept.length === 1 ? 'search' : 'searches'}
        </span>
        <button type="button" disabled={busy || !answer} onClick={() => onSend(answer)}>
          Use these
        </button>
      </div>
    </div>
  )
}
