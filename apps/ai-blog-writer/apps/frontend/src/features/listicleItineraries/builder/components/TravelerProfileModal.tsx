import { useEffect, useState } from 'react'
import {
  createEmptyTravelerProfile,
  isTravelerProfileEmpty,
  type TravelerProfile,
  type TravelerProfileBudget,
} from '../../types'
import {
  ACCOMMODATION_OPTIONS,
  BUDGET_OPTIONS,
  INTEREST_GROUPS,
  PRACTICAL_NEED_OPTIONS,
  TRAVELER_TYPE_OPTIONS,
  TRIP_MOTIVATION_OPTIONS,
} from '../constants/traveler-profile.constants'

type Props = {
  isOpen: boolean
  profile: TravelerProfile | undefined
  onCompose: (profile: TravelerProfile) => Promise<string>
  /** Persist the profile and replace the Generation Brief. Return false to keep the modal open (e.g. declined overwrite confirm). */
  onApply: (profile: TravelerProfile, brief: string) => boolean
  onClose: () => void
}

function toggleValue(values: string[], value: string): string[] {
  return values.includes(value)
    ? values.filter((entry) => entry !== value)
    : [...values, value]
}

export function TravelerProfileModal({ isOpen, profile, onCompose, onApply, onClose }: Props) {
  const [working, setWorking] = useState<TravelerProfile>(profile ?? createEmptyTravelerProfile())
  const [composedText, setComposedText] = useState('')
  const [isComposing, setIsComposing] = useState(false)
  const [composeError, setComposeError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setWorking(profile ?? createEmptyTravelerProfile())
    setComposedText('')
    setComposeError(null)
  }, [isOpen, profile])

  useEffect(() => {
    if (!isOpen) return
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  function handleOverlayClick(event: React.MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onClose()
  }

  const updateWorking = (next: Partial<TravelerProfile>) => {
    setWorking((current) => ({ ...current, ...next }))
  }

  const handleCompose = async () => {
    setIsComposing(true)
    setComposeError(null)
    try {
      const brief = await onCompose(working)
      setComposedText(brief)
    } catch (err) {
      setComposeError(err instanceof Error ? err.message : 'AI brief composition failed.')
    } finally {
      setIsComposing(false)
    }
  }

  const handleApply = () => {
    const brief = composedText.trim()
    if (!brief) return
    const applied = onApply({ ...working, composedBrief: brief }, brief)
    if (applied) onClose()
  }

  const renderChips = (
    options: readonly string[],
    selected: string[],
    onToggle: (value: string) => void,
  ) => (
    <div className="stl-tp-chips">
      {options.map((option) => {
        const isSelected = selected.includes(option)
        return (
          <button
            key={option}
            type="button"
            className={`stl-tp-chip${isSelected ? ' is-selected' : ''}`}
            aria-pressed={isSelected}
            onClick={() => onToggle(option)}
          >
            {option}
          </button>
        )
      })}
    </div>
  )

  const canCompose = !isComposing && !isTravelerProfileEmpty(working)

  return (
    <div className="stl-modal-overlay" onClick={handleOverlayClick}>
      <div
        className="stl-picker-modal stl-traveler-profile-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Traveler Profile"
      >
        <div className="stl-picker-modal__header">
          <div className="stl-existing-stop-picker__header-copy">
            <h3>Traveler Profile</h3>
            <p>
              Describe who this itinerary is for. AI composes the selections into a
              Description (AI Autobuild brief) paragraph — venues are picked later by Autobuild.
              Everything is optional.
            </p>
          </div>
          <button type="button" className="stl-picker-modal__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="stl-traveler-profile-modal__body">
          <section className="stl-tp-section">
            <h4 className="stl-tp-section__title">Traveler Type</h4>
            {renderChips(TRAVELER_TYPE_OPTIONS, working.travelerTypes, (value) => (
              updateWorking({ travelerTypes: toggleValue(working.travelerTypes, value) })
            ))}
          </section>

          <section className="stl-tp-section">
            <h4 className="stl-tp-section__title">What Brings Them Here?</h4>
            {renderChips(TRIP_MOTIVATION_OPTIONS, working.motivations, (value) => (
              updateWorking({ motivations: toggleValue(working.motivations, value) })
            ))}
          </section>

          <section className="stl-tp-section">
            <h4 className="stl-tp-section__title">Interests</h4>
            {INTEREST_GROUPS.map((group) => (
              <div className="stl-tp-interest-group" key={group.label}>
                <h5 className="stl-tp-interest-group__title">{group.label}</h5>
                {renderChips(group.options, working.interests, (value) => (
                  updateWorking({ interests: toggleValue(working.interests, value) })
                ))}
              </div>
            ))}
          </section>

          <section className="stl-tp-section">
            <h4 className="stl-tp-section__title">Budget</h4>
            <div className="stl-tp-chips">
              {BUDGET_OPTIONS.map((option) => {
                const isSelected = working.budget === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`stl-tp-chip${isSelected ? ' is-selected' : ''}`}
                    aria-pressed={isSelected}
                    onClick={() => updateWorking({
                      budget: isSelected ? '' : option.value as TravelerProfileBudget,
                    })}
                  >
                    {option.value} · {option.description}
                  </button>
                )
              })}
            </div>
          </section>

          <section className="stl-tp-section">
            <h4 className="stl-tp-section__title">Accommodation Preference</h4>
            {renderChips(ACCOMMODATION_OPTIONS, working.accommodations, (value) => (
              updateWorking({ accommodations: toggleValue(working.accommodations, value) })
            ))}
          </section>

          <section className="stl-tp-section">
            <h4 className="stl-tp-section__title">Comfort and Practical Needs</h4>
            {renderChips(PRACTICAL_NEED_OPTIONS, working.practicalNeeds, (value) => (
              updateWorking({ practicalNeeds: toggleValue(working.practicalNeeds, value) })
            ))}
          </section>

          <section className="stl-tp-section">
            <h4 className="stl-tp-section__title">In Your Own Words</h4>
            <textarea
              className="stl-field-input stl-tp-notes"
              rows={3}
              value={working.notes}
              placeholder="Anything the selections don't capture — it wins over them on conflicts."
              onChange={(event) => updateWorking({ notes: event.target.value })}
            />
          </section>

          <section className="stl-tp-section">
            <div className="stl-tp-compose-row">
              <button
                type="button"
                className="stl-btn stl-btn-primary"
                onClick={() => void handleCompose()}
                disabled={!canCompose}
              >
                {isComposing ? 'Composing…' : composedText ? 'Regenerate' : 'Compose brief'}
              </button>
              {composeError ? <span className="stl-tp-compose-error">{composeError}</span> : null}
            </div>
            {composedText ? (
              <textarea
                className="stl-field-input stl-tp-preview"
                rows={5}
                value={composedText}
                aria-label="Composed brief preview"
                onChange={(event) => setComposedText(event.target.value)}
              />
            ) : null}
          </section>
        </div>

        <div className="stl-picker-modal__footer">
          <span className="stl-existing-stop-picker__count">
            {composedText ? 'Review the paragraph, then apply it to the brief.' : 'Compose to preview the brief.'}
          </span>
          <button type="button" className="stl-btn stl-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="stl-btn"
            onClick={handleApply}
            disabled={!composedText.trim() || isComposing}
          >
            Apply to brief
          </button>
        </div>
      </div>
    </div>
  )
}
