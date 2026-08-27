import {
  Bike,
  Binoculars,
  Building2,
  Car,
  Check,
  ChevronDown,
  CircleOff,
  Coffee,
  CookingPot,
  Croissant,
  Footprints,
  IceCreamBowl,
  Landmark,
  Laptop,
  Map,
  Martini,
  Music2,
  Palette,
  Route,
  Sailboat,
  Sandwich,
  ScrollText,
  ShoppingBag,
  Sparkles,
  Store,
  Sunset,
  Trees,
  University,
  UtensilsCrossed,
  Waves,
  Wine,
  type LucideIcon
} from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import type { ItineraryItemBlock, ItineraryMoment } from '../../types'

type MomentOption = {
  value: ItineraryMoment
  label: string
  Icon: LucideIcon
}

const ITINERARY_MOMENT_OPTIONS: MomentOption[] = [
  { value: 'breakfast', label: 'Breakfast', Icon: Croissant },
  { value: 'coffee', label: 'Coffee break', Icon: Coffee },
  { value: 'morning-walk', label: 'Morning walk', Icon: Footprints },
  { value: 'remote-work', label: 'Remote work', Icon: Laptop },
  { value: 'coworking-stop', label: 'Coworking stop', Icon: Laptop },
  { value: 'lunch', label: 'Lunch', Icon: Sandwich },
  { value: 'street-food', label: 'Street food', Icon: CookingPot },
  { value: 'sweet-treat', label: 'Sweet treat', Icon: IceCreamBowl },
  { value: 'culture', label: 'Culture stop', Icon: Palette },
  { value: 'historic-site', label: 'Historic site', Icon: ScrollText },
  { value: 'museum-visit', label: 'Museum visit', Icon: University },
  { value: 'landmark', label: 'Must-see landmark', Icon: Landmark },
  { value: 'guided-tour', label: 'Guided tour', Icon: Map },
  { value: 'local-market', label: 'Local market', Icon: Store },
  { value: 'shopping', label: 'Shopping stop', Icon: ShoppingBag },
  { value: 'outdoor', label: 'Outdoor break', Icon: Trees },
  { value: 'beach-time', label: 'Beach time', Icon: Waves },
  { value: 'scenic-viewpoint', label: 'Scenic viewpoint', Icon: Binoculars },
  { value: 'wellness-break', label: 'Wellness break', Icon: Sparkles },
  { value: 'active-adventure', label: 'Active adventure', Icon: Bike },
  { value: 'boat-ride', label: 'Boat ride', Icon: Sailboat },
  { value: 'day-trip', label: 'Day trip', Icon: Car },
  { value: 'in-transit', label: 'In transit', Icon: Route },
  { value: 'sunset', label: 'Sunset stop', Icon: Sunset },
  { value: 'rooftop-stop', label: 'Rooftop stop', Icon: Building2 },
  { value: 'dinner', label: 'Dinner', Icon: UtensilsCrossed },
  { value: 'cocktails', label: 'Cocktails', Icon: Martini },
  { value: 'drinks', label: 'Drinks', Icon: Wine },
  { value: 'nightlife', label: 'Nightlife', Icon: Music2 }
]

function MomentBadgePicker({
  selected,
  onSelect
}: {
  selected: MomentOption | undefined
  onSelect: (next: MomentOption | undefined) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const listboxId = useId().replace(/:/g, '')
  const pickerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const SelectedIcon = selected?.Icon ?? CircleOff
  const optionCount = ITINERARY_MOMENT_OPTIONS.length + 1

  useEffect(() => {
    if (!isOpen) return

    const selectedIndex = selected
      ? ITINERARY_MOMENT_OPTIONS.findIndex(
          (option) => option.value === selected.value
        ) + 1
      : 0
    optionRefs.current[selectedIndex]?.focus()

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !pickerRef.current?.contains(event.target)
      ) {
        setIsOpen(false)
      }
    }
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setIsOpen(false)
      triggerRef.current?.focus()
    }

    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [isOpen, selected])

  const chooseAndClose = (next: MomentOption | undefined) => {
    onSelect(next)
    setIsOpen(false)
    triggerRef.current?.focus()
  }

  const focusOption = (index: number) => {
    const wrappedIndex = (index + optionCount) % optionCount
    optionRefs.current[wrappedIndex]?.focus()
  }

  const handleOptionKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number
  ) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      focusOption(index + 1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      focusOption(index - 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      focusOption(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      focusOption(optionCount - 1)
    }
  }

  return (
    <div className="stl-moment-picker" ref={pickerRef}>
      <button
        ref={triggerRef}
        type="button"
        className="stl-moment-picker__trigger"
        aria-label="Moment badge"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        onClick={() => setIsOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
          event.preventDefault()
          setIsOpen(true)
        }}
      >
        <span className="stl-moment-picker__icon">
          <SelectedIcon size={18} strokeWidth={1.8} aria-hidden />
        </span>
        <span
          className={
            selected
              ? 'stl-moment-picker__value'
              : 'stl-moment-picker__value stl-moment-picker__value--empty'
          }
        >
          {selected?.label ?? 'No moment badge'}
        </span>
        <ChevronDown
          className={
            isOpen
              ? 'stl-moment-picker__chevron stl-moment-picker__chevron--open'
              : 'stl-moment-picker__chevron'
          }
          size={17}
          strokeWidth={1.8}
          aria-hidden
        />
      </button>

      {isOpen ? (
        <ul
          id={listboxId}
          className="stl-moment-picker__menu"
          role="listbox"
          aria-label="Moment badge options"
        >
          <li role="presentation">
            <button
              ref={(element) => {
                optionRefs.current[0] = element
              }}
              type="button"
              className={
                selected
                  ? 'stl-moment-picker__option'
                  : 'stl-moment-picker__option stl-moment-picker__option--selected'
              }
              role="option"
              aria-selected={!selected}
              tabIndex={-1}
              onKeyDown={(event) => handleOptionKeyDown(event, 0)}
              onClick={() => chooseAndClose(undefined)}
            >
              <span className="stl-moment-picker__icon">
                <CircleOff size={18} strokeWidth={1.8} aria-hidden />
              </span>
              <span>No moment badge</span>
              {!selected ? <Check size={16} aria-hidden /> : null}
            </button>
          </li>

          {ITINERARY_MOMENT_OPTIONS.map((option, optionIndex) => {
            const Icon = option.Icon
            const active = option.value === selected?.value
            const index = optionIndex + 1
            return (
              <li key={option.value} role="presentation">
                <button
                  ref={(element) => {
                    optionRefs.current[index] = element
                  }}
                  type="button"
                  className={
                    active
                      ? 'stl-moment-picker__option stl-moment-picker__option--selected'
                      : 'stl-moment-picker__option'
                  }
                  role="option"
                  aria-selected={active}
                  tabIndex={-1}
                  onKeyDown={(event) => handleOptionKeyDown(event, index)}
                  onClick={() => chooseAndClose(option)}
                >
                  <span className="stl-moment-picker__icon">
                    <Icon size={18} strokeWidth={1.8} aria-hidden />
                  </span>
                  <span>{option.label}</span>
                  {active ? <Check size={16} aria-hidden /> : null}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}

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
  const chooseMoment = (next: MomentOption | undefined) => {
    onChange((current) => ({
      ...current,
      moment: next?.value ?? null,
      momentLabel: next?.label ?? ''
    }))
  }

  return (
    <div className="stl-grid stl-grid-2 stl-moment-fields">
      <div className="stl-field">
        <span>Moment badge</span>
        <MomentBadgePicker selected={selected} onSelect={chooseMoment} />
      </div>

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
        <summary>Browse {ITINERARY_MOMENT_OPTIONS.length} moment icons</summary>
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
