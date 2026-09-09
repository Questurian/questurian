import { useEffect, useMemo, useState } from 'react'
import type { ListicleAngleSelection, ListicleGrillOption } from '../types'

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
 *
 * Two things changed with the plan of 2026-09-08. What is sent back is the
 * records, not a paragraph -- so the order knows which menu entry each line
 * came from and whether it was changed, instead of inferring it from a
 * sentence. And a clash is explained rather than announced: `cheap` and
 * `hidden` used to be one group of which at most one could be chosen, and an
 * expensive hidden bar and a cheap neighbourhood one are both real.
 */

export interface AnglePickerProps {
  options: ListicleGrillOption[]
  busy: boolean
  onSend: (answer: string, selections: ListicleAngleSelection[]) => void
}

interface Choice extends ListicleGrillOption {
  keep: boolean
  /** The wording as it arrived. What "edited" is measured against. */
  original: string
}

/** What each role means, said in the operator's terms rather than the
 *  catalogue's. The number a search is asked for follows from it. */
const ROLE_NOTE: Record<string, string> = {
  broad: 'fills a lot of the list',
  distinctive: 'finds what the broad searches miss',
  specific: 'a handful of places; one is a good answer',
}

export function AnglePicker({ options, busy, onSend }: AnglePickerProps) {
  const [choices, setChoices] = useState<Choice[]>([])

  // A new question replaces the list outright. Carrying edits across questions
  // would silently answer the new one with the old one's lines.
  useEffect(() => {
    setChoices(
      options.map(option => ({
        ...option,
        keep: option.recommended,
        original: option.text,
      })),
    )
  }, [options])

  const kept = choices.filter(choice => choice.keep && choice.text.trim())
  const answer = kept.map(choice => choice.text.trim()).join('\n')

  const selections: ListicleAngleSelection[] = kept.map((choice, index) => ({
    text: choice.text.trim(),
    angle_id: `a${index + 1}`,
    shape_key: choice.shape,
    group: choice.group,
    role: choice.role,
    // Measured against the wording that arrived, not guessed at afterwards.
    // An edited line may no longer mean what its shape meant, and everything
    // downstream treats the catalogue's opinion about it as provisional.
    edited: choice.text.trim() !== choice.original.trim(),
    custom: !choice.shape,
  }))

  // Two ticked angles that tend to return the same places. Explained, never
  // enforced: the operator knows the city, and the pairs that actually collide
  // vary by city -- award-listed and expensive are the same restaurants in some
  // and nothing like each other in others.
  const clashes = useMemo(() => {
    const byGroup = new Map<string, Choice[]>()
    for (const choice of kept) {
      if (!choice.group || choice.text.trim() !== choice.original.trim()) continue
      byGroup.set(choice.group, [...(byGroup.get(choice.group) ?? []), choice])
    }
    return [...byGroup].filter(([, group]) => group.length > 1)
  }, [kept])

  // A line the operator rewrote. Worth saying once, because the theme label
  // still shown beside it came from the wording it no longer has.
  const editedCount = selections.filter(selection => selection.edited).length

  function update(index: number, patch: Partial<Choice>) {
    setChoices(current =>
      current.map((choice, at) => (at === index ? { ...choice, ...patch } : choice)),
    )
  }

  function row(choice: Choice, index: number) {
    const changed = choice.text.trim() !== choice.original.trim()
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
        <span className="lp-picker-tags">
          {choice.role && (
            <span className="lp-picker-role" title={ROLE_NOTE[choice.role] ?? ''}>
              {choice.role}
            </span>
          )}
          {choice.group && (
            <span
              className={
                changed ? 'lp-picker-group lp-picker-group-stale' : 'lp-picker-group'
              }
              title={
                changed
                  ? 'You changed this line, so this label describes the wording it used to have.'
                  : undefined
              }
            >
              {choice.group}
              {changed ? '?' : ''}
            </span>
          )}
        </span>
      </li>
    )
  }

  const picks = choices.map((choice, index) => [choice, index] as const)
  const recommended = picks.filter(([choice]) => choice.recommended)
  const alternates = picks.filter(([choice]) => !choice.recommended)

  // Alternatives grouped by their theme, so the menu reads as kinds of angle
  // rather than as a long undifferentiated list. Ungrouped ones -- the
  // catalogue has no shape for them -- go last under their own heading,
  // because they are the ones nothing else could have suggested.
  const alternateGroups = useMemo(() => {
    const byTheme = new Map<string, (readonly [Choice, number])[]>()
    for (const entry of alternates) {
      const theme = entry[0].group || 'Specific to this list'
      byTheme.set(theme, [...(byTheme.get(theme) ?? []), entry])
    }
    return [...byTheme].sort(([a], [b]) =>
      a === 'Specific to this list' ? 1 : b === 'Specific to this list' ? -1 : a.localeCompare(b),
    )
  }, [alternates])

  return (
    <div className="lp-picker">
      <p className="lp-picker-hint">
        These are the searches. Untick what you don&apos;t want, edit the wording, or
        take one from below. A line you edit is kept exactly as you write it.
      </p>

      <ul className="lp-picker-list">{recommended.map(([choice, index]) => row(choice, index))}</ul>

      {alternateGroups.length > 0 && (
        <>
          <p className="lp-picker-heading">
            Other angles for this list &mdash; tick any to add
          </p>
          {alternateGroups.map(([theme, entries]) => (
            <div key={theme} className="lp-picker-theme">
              <p className="lp-picker-theme-name">{theme}</p>
              <ul className="lp-picker-list">
                {entries.map(([choice, index]) => row(choice, index))}
              </ul>
            </div>
          ))}
        </>
      )}

      {clashes.map(([group, members]) => (
        <p key={group} className="lp-picker-warning" role="status">
          {members.length} ticked angles are both <strong>{group}</strong>. Those often
          return the same places, so one may be a wasted search &mdash; keep both if you
          know this city separates them.
        </p>
      ))}

      {editedCount > 0 && (
        <p className="lp-picker-note" role="status">
          {editedCount === 1 ? 'One line has' : `${editedCount} lines have`} been edited.
          Your wording is used exactly as written; the labels beside{' '}
          {editedCount === 1 ? 'it' : 'them'} describe what{' '}
          {editedCount === 1 ? 'it' : 'they'} said before.
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
              {
                text: '',
                recommended: true,
                group: '',
                shape: '',
                role: 'distinctive',
                keep: true,
                original: '',
              },
            ])
          }
        >
          Add an angle
        </button>
        <span className="lp-picker-count">
          {/* The honest progress signal: how many separate searches this
              order will run. How many places each one is asked for is worked
              out from the count and the roles once the order is agreed. */}
          {kept.length} {kept.length === 1 ? 'search' : 'searches'}
        </span>
        <button
          type="button"
          disabled={busy || !answer}
          onClick={() => onSend(answer, selections)}
        >
          Use these
        </button>
      </div>
    </div>
  )
}
