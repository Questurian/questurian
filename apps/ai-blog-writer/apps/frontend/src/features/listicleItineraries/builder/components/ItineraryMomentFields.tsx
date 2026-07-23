import {
  Coffee,
  Croissant,
  IceCreamBowl,
  Landmark,
  Music2,
  Palette,
  Sandwich,
  ShoppingBag,
  Sunset,
  Trees,
  UtensilsCrossed,
  Wine,
  type LucideIcon
} from 'lucide-react'
import type { ItineraryItemBlock, ItineraryMoment } from '../../types'

type MomentOption = {
  value: ItineraryMoment
  label: string
  Icon: LucideIcon
}

const ITINERARY_MOMENT_OPTIONS: MomentOption[] = [
  { value: 'breakfast', label: 'Breakfast', Icon: Croissant },
  { value: 'coffee', label: 'Coffee break', Icon: Coffee },
  { value: 'lunch', label: 'Lunch', Icon: Sandwich },
  { value: 'sweet-treat', label: 'Sweet treat', Icon: IceCreamBowl },
  { value: 'culture', label: 'Culture stop', Icon: Palette },
  { value: 'landmark', label: 'Must-see landmark', Icon: Landmark },
  { value: 'shopping', label: 'Shopping stop', Icon: ShoppingBag },
  { value: 'outdoor', label: 'Outdoor break', Icon: Trees },
  { value: 'sunset', label: 'Sunset stop', Icon: Sunset },
  { value: 'dinner', label: 'Dinner', Icon: UtensilsCrossed },
  { value: 'drinks', label: 'Drinks', Icon: Wine },
  { value: 'nightlife', label: 'Nightlife', Icon: Music2 }
]

export function ItineraryMomentFields({
  item,
  onChange
}: {
  item: ItineraryItemBlock
  onChange: (
    updater: (current: ItineraryItemBlock) => ItineraryItemBlock
  ) => void
}) {
  const selected = ITINERARY_MOMENT_OPTIONS.find(
    (option) => option.value === item.moment
  )
  const SelectedIcon = selected?.Icon
  const chooseMoment = (next: MomentOption | undefined) => {
    onChange((current) => ({
      ...current,
      moment: next?.value ?? null,
      momentLabel: next?.label ?? ''
    }))
  }

  return (
    <div className="stl-grid stl-grid-2 stl-moment-fields">
      <label className="stl-field">
        <span>Moment badge</span>
        <span className="stl-moment-select">
          {SelectedIcon ? (
            <SelectedIcon size={18} strokeWidth={1.8} aria-hidden />
          ) : null}
          <select
            value={item.moment ?? ''}
            onChange={(event) => {
              const next = ITINERARY_MOMENT_OPTIONS.find(
                (option) => option.value === event.target.value
              )
              chooseMoment(next)
            }}
          >
            <option value="">No moment badge</option>
            {ITINERARY_MOMENT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </span>
      </label>

      {selected ? (
        <label className="stl-field">
          <span>Moment label</span>
          <input
            type="text"
            maxLength={48}
            value={item.momentLabel ?? ''}
            placeholder={selected.label}
            onChange={(event) =>
              onChange((current) => ({
                ...current,
                momentLabel: event.target.value
              }))
            }
          />
        </label>
      ) : null}

      <details className="stl-moment-library">
        <summary>Browse 12 moment icons</summary>
        <div className="stl-moment-library__grid">
          {ITINERARY_MOMENT_OPTIONS.map((option) => {
            const Icon = option.Icon
            const active = option.value === item.moment
            return (
              <button
                key={option.value}
                type="button"
                className={
                  active
                    ? 'stl-moment-option stl-moment-option--active'
                    : 'stl-moment-option'
                }
                aria-label={`${option.label} moment`}
                aria-pressed={active}
                onClick={() => chooseMoment(option)}
              >
                <Icon size={20} strokeWidth={1.8} aria-hidden />
                <span>{option.label}</span>
              </button>
            )
          })}
        </div>
      </details>
    </div>
  )
}
