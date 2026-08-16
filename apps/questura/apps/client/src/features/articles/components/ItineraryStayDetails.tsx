'use client'

import type { JSX } from 'react'
import {
  Baby,
  Bath,
  BedDouble,
  Building2,
  Car,
  CircleDollarSign,
  Coffee,
  Dumbbell,
  Footprints,
  Laptop,
  LogIn,
  LogOut,
  Mail,
  MapPin,
  Snowflake,
  Sparkles,
  Sunset,
  UserPlus,
  UtensilsCrossed,
  Waves,
  Wifi,
} from 'lucide-react'
import {
  ItineraryDetailsModal,
  type ItineraryDetailRow,
} from '@/features/articles/components/ItineraryDetailsModal'
import { formatPriceTier, isHttpUrl } from '@/features/articles/lib/listicleVenueFormatters'
import type { GridCell } from '@/features/articles/components/ListicleVenueInfoGrid'
import type { ListicleVenue } from '@/features/articles/types/mapsListicle'

/**
 * Full accommodation profile for the "Where you're staying" card, surfacing
 * every field the accommodations data point ships (exploration pass — prune
 * once the keep/drop call is made). Compact pieces (meta row, chips, booking
 * card) render inline; the long amenity list lives behind a modal triggered
 * from the venue info grid, mirroring the hours modal.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function group(item: ListicleVenue, key: string): Record<string, unknown> {
  const value = (item as unknown as Record<string, unknown>)[key]
  return isRecord(value) ? value : {}
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function bool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function titleCase(value: string): string {
  return value
    .split(/[\s-]+/)
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ')
}

function list(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string' && v.trim() !== '')
}

/** "15:00" → "3:00 PM"; anything unparseable passes through untouched. */
function formatClockTime(raw: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw)
  if (!match) return raw
  const hours = Number(match[1])
  if (hours > 23) return raw
  const suffix = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours % 12 === 0 ? 12 : hours % 12
  return `${displayHours}:${match[2]} ${suffix}`
}

const accentClass =
  'maps-listicle-info-icon text-[var(--maps-listicle-accent)] shrink-0 size-[15px] 480:size-[16px] sm:size-[17px]'

function buildAmenityRows(item: ListicleVenue): ItineraryDetailRow[] {
  const raw = item as unknown as Record<string, unknown>
  const core = group(item, 'core')
  const theStay = group(item, 'theStay')
  const theExperience = group(item, 'theExperience')
  const theDetails = group(item, 'theDetails')

  const rows: ItineraryDetailRow[] = []
  const push = (key: string, icon: JSX.Element, label: string, value: string) => {
    if (value) rows.push({ key, icon, label, value })
  }
  const pushBool = (key: string, icon: JSX.Element, label: string, value: unknown) => {
    const b = bool(value)
    if (b !== null) push(key, icon, label, b ? 'Yes' : 'No')
  }
  const pushList = (key: string, icon: JSX.Element, label: string, value: unknown) => {
    const values = list(value)
    if (values.length > 0) push(key, icon, label, values.map(titleCase).join(', '))
  }

  push('price', <CircleDollarSign className={accentClass} strokeWidth={1.75} aria-hidden />, 'Price', formatPriceTier(core.price))
  const stayType = text(core.type) || text(item.type)
  if (stayType) push('stay-type', <Building2 className={accentClass} strokeWidth={1.75} aria-hidden />, 'Stay type', titleCase(stayType))
  push('district', <MapPin className={accentClass} strokeWidth={1.75} aria-hidden />, 'Neighborhood', text(core.district))

  const checkIn = text(theDetails.checkInTime)
  if (checkIn) push('check-in', <LogIn className={accentClass} strokeWidth={1.75} aria-hidden />, 'Check-in', formatClockTime(checkIn))
  const checkOut = text(theDetails.checkOutTime)
  if (checkOut) push('check-out', <LogOut className={accentClass} strokeWidth={1.75} aria-hidden />, 'Check-out', formatClockTime(checkOut))

  pushBool('wifi', <Wifi className={accentClass} strokeWidth={1.75} aria-hidden />, 'Wi-Fi', theStay.wifi)
  pushBool('ac', <Snowflake className={accentClass} strokeWidth={1.75} aria-hidden />, 'Air conditioning', theStay.ac)
  pushBool('breakfast', <Coffee className={accentClass} strokeWidth={1.75} aria-hidden />, 'Breakfast served', theStay.breakfastServed)
  pushBool('kids', <Baby className={accentClass} strokeWidth={1.75} aria-hidden />, 'Kid-friendly', theStay.kidFriendly)
  pushBool('extra-guest', <UserPlus className={accentClass} strokeWidth={1.75} aria-hidden />, 'Extra guest fee', theStay.extraGuestFee)
  pushList('parking', <Car className={accentClass} strokeWidth={1.75} aria-hidden />, 'Parking', theStay.parking)

  pushList('vibe', <Sparkles className={accentClass} strokeWidth={1.75} aria-hidden />, 'Vibe', theExperience.vibe)
  pushBool('restaurant', <UtensilsCrossed className={accentClass} strokeWidth={1.75} aria-hidden />, 'Restaurant', theExperience.restaurant)
  pushList('pool', <Waves className={accentClass} strokeWidth={1.75} aria-hidden />, 'Pool', theExperience.pool)
  pushBool('rooftop', <Sunset className={accentClass} strokeWidth={1.75} aria-hidden />, 'Rooftop lounge', theExperience.rooftopLounge)
  pushList('jacuzzi', <Bath className={accentClass} strokeWidth={1.75} aria-hidden />, 'Jacuzzi', theExperience.jacuzzi)
  const gym = text(theExperience.gym)
  if (gym && gym !== 'None') push('gym', <Dumbbell className={accentClass} strokeWidth={1.75} aria-hidden />, 'Gym', gym)
  const workspace = text(theExperience.workspace)
  if (workspace && workspace !== 'None') push('workspace', <Laptop className={accentClass} strokeWidth={1.75} aria-hidden />, 'Workspace', workspace)

  const walkability = text(theDetails.walkability)
  if (walkability) push('walkability', <Footprints className={accentClass} strokeWidth={1.75} aria-hidden />, 'Getting around', walkability)
  const email = text(raw.email)
  if (email) push('email', <Mail className={accentClass} strokeWidth={1.75} aria-hidden />, 'Email', email)

  return rows
}

function buildFinePrint(item: ListicleVenue): string[] {
  const raw = item as unknown as Record<string, unknown>
  const locationRef = group(item, 'locationRef')

  const parts: string[] = []
  const place = [
    text(locationRef.neighborhoodName),
    text(locationRef.cityName),
    text(locationRef.countryName),
  ]
    .filter(Boolean)
    .join(', ')
  if (place) parts.push(place)
  const timezone = text(raw.ianaTimeId)
  if (timezone) parts.push(timezone)
  if (typeof raw.latitude === 'number' && typeof raw.longitude === 'number') {
    parts.push(`${raw.latitude.toFixed(4)}, ${raw.longitude.toFixed(4)}`)
  }
  const source = text(raw.sourceName)
  if (source && source !== item.title) parts.push(`Source: ${source}`)
  return parts
}

/**
 * Cell for ListicleVenueInfoGrid's `extraCells` opening the amenities modal.
 * Null when the accommodation has no profile data to show.
 */
export function buildStayAmenitiesCell(item: ListicleVenue): GridCell | null {
  const rows = buildAmenityRows(item)
  const finePrint = buildFinePrint(item)
  if (rows.length === 0 && finePrint.length === 0) return null

  return {
    key: 'stay-amenities',
    icon: <BedDouble className={accentClass} strokeWidth={1.75} aria-hidden />,
    node: (
      <ItineraryDetailsModal
        venueTitle={item.title}
        heading="Amenities"
        rows={rows}
        finePrint={finePrint}
      />
    ),
  }
}

/** Nav-style "BOOK NOW" link wired to the accommodation profile booking URL. */
export function ItineraryStayBookingCard({ item }: { item: ListicleVenue }): JSX.Element | null {
  const theDetails = group(item, 'theDetails')
  const bookingRaw = text(theDetails.bookingUrl) || text(item.bookingUrl)
  if (!bookingRaw) return null
  const bookingHref = isHttpUrl(bookingRaw) ? bookingRaw : `https://${bookingRaw}`

  return (
    <a
      href={bookingHref}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex h-14 w-full items-center justify-center rounded-none bg-[#111111] px-5 font-[var(--font-dm-sans)] text-[0.9rem] font-light leading-none tracking-[0.015em] text-white transition-colors duration-150 ease-out hover:bg-[#3B5BDB] active:bg-[#3451C7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B5BDB]/50 focus-visible:ring-offset-2 motion-reduce:transition-none"
    >
      BOOK NOW
    </a>
  )
}
