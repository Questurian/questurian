import type { JSX } from 'react'
import {
  Building2,
  CircleDollarSign,
  Clock,
  LayoutGrid,
  Mail,
  Music2,
  Ruler,
  Shirt,
  Sparkles,
  Users,
  UtensilsCrossed,
  Wine,
  Zap,
} from 'lucide-react'
import {
  ItineraryDetailsModal,
  type ItineraryDetailRow,
} from '@/features/articles/components/ItineraryDetailsModal'
import type { GridCell } from '@/features/articles/components/ListicleVenueInfoGrid'
import { formatListicleOperationHours } from '@/features/articles/lib/listicleVenueFormatters'
import type { ListicleVenue } from '@/features/articles/types/mapsListicle'

const accentClass =
  'maps-listicle-info-icon text-[var(--maps-listicle-accent)] shrink-0 size-[15px] 480:size-[16px] sm:size-[17px]'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function group(value: unknown, key: string): Record<string, unknown> {
  if (!isRecord(value)) return {}
  const child = value[key]
  return isRecord(child) ? child : {}
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function displayText(value: string): string {
  const normalized = value.replace(/[_-]+/g, ' ').trim()
  if (!normalized) return ''
  if (/[A-Z]/.test(normalized)) return normalized
  return normalized[0].toUpperCase() + normalized.slice(1)
}

function list(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
    .map((entry) => displayText(entry))
}

function buildNightlifeRows(item: ListicleVenue): ItineraryDetailRow[] {
  const raw = item as unknown as Record<string, unknown>
  const profile = group(raw, 'nightlifeDetails')
  const core = group(profile, 'core')
  const space = group(profile, 'theSpace')
  const scene = group(profile, 'theScene')
  const details = group(profile, 'theDetails')
  const rows: ItineraryDetailRow[] = []

  const push = (key: string, icon: JSX.Element, label: string, value: string) => {
    if (value) rows.push({ key, icon, label, value })
  }
  const pushText = (
    key: string,
    icon: JSX.Element,
    label: string,
    value: unknown,
  ) => {
    const normalized = text(value)
    if (normalized) push(key, icon, label, displayText(normalized))
  }
  const pushList = (
    key: string,
    icon: JSX.Element,
    label: string,
    value: unknown,
  ) => {
    const values = list(value)
    if (values.length > 0) push(key, icon, label, values.join(', '))
  }

  pushText(
    'club-type',
    <Building2 className={accentClass} strokeWidth={1.75} aria-hidden />,
    'Club type',
    core.clubType ?? item.type,
  )

  const priceTier = text(core.priceTier)
  const fallbackPriceLevel = text(item.priceLevel)
  const price =
    priceTier ||
    (/^[1-4]$/.test(fallbackPriceLevel) ? '$'.repeat(Number(fallbackPriceLevel)) : '')
  push(
    'price',
    <CircleDollarSign className={accentClass} strokeWidth={1.75} aria-hidden />,
    'Price',
    price,
  )
  pushList(
    'music',
    <Music2 className={accentClass} strokeWidth={1.75} aria-hidden />,
    'Music',
    core.music,
  )
  pushList(
    'ideal-for',
    <Users className={accentClass} strokeWidth={1.75} aria-hidden />,
    'Ideal for',
    core.idealFor,
  )
  pushText(
    'venue-type',
    <Building2 className={accentClass} strokeWidth={1.75} aria-hidden />,
    'Venue type',
    space.venueType,
  )
  pushText(
    'venue-size',
    <Ruler className={accentClass} strokeWidth={1.75} aria-hidden />,
    'Venue size',
    space.venueSize,
  )
  pushList(
    'layout',
    <LayoutGrid className={accentClass} strokeWidth={1.75} aria-hidden />,
    'Layout',
    space.spaceLayout,
  )
  pushList(
    'vibe',
    <Sparkles className={accentClass} strokeWidth={1.75} aria-hidden />,
    'Vibe',
    space.vibe,
  )
  pushText(
    'peak-hours',
    <Clock className={accentClass} strokeWidth={1.75} aria-hidden />,
    'Peak hours',
    space.peakHours,
  )
  pushList(
    'music-format',
    <Music2 className={accentClass} strokeWidth={1.75} aria-hidden />,
    'Music format',
    scene.musicFormat,
  )
  pushText(
    'tourist-presence',
    <Users className={accentClass} strokeWidth={1.75} aria-hidden />,
    'Tourist presence',
    scene.touristPresence,
  )
  pushList(
    'dress-code',
    <Shirt className={accentClass} strokeWidth={1.75} aria-hidden />,
    'Dress code',
    scene.dressCode,
  )
  pushText(
    'energy-level',
    <Zap className={accentClass} strokeWidth={1.75} aria-hidden />,
    'Energy level',
    scene.energyLevel,
  )
  pushText(
    'vip-service',
    <Wine className={accentClass} strokeWidth={1.75} aria-hidden />,
    'VIP & bottle service',
    scene.vipAndBottleService,
  )
  pushText(
    'crowd-profile',
    <Users className={accentClass} strokeWidth={1.75} aria-hidden />,
    'Crowd',
    scene.crowdProfile,
  )

  const operationHours = formatListicleOperationHours(details.operationHours)
  push(
    'hours',
    <Clock className={accentClass} strokeWidth={1.75} aria-hidden />,
    'Hours',
    operationHours ?? '',
  )

  if (typeof details.daytimeRestaurant === 'boolean') {
    push(
      'daytime-restaurant',
      <UtensilsCrossed className={accentClass} strokeWidth={1.75} aria-hidden />,
      'Daytime restaurant',
      details.daytimeRestaurant ? 'Yes' : 'No',
    )
  }

  const email = text(raw.email)
  push(
    'email',
    <Mail className={accentClass} strokeWidth={1.75} aria-hidden />,
    'Email',
    email,
  )

  return rows
}

function buildFinePrint(item: ListicleVenue): string[] {
  const raw = item as unknown as Record<string, unknown>
  const locationRef = group(raw, 'locationRef')
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
  return parts
}

export function buildNightlifeDetailsCell(item: ListicleVenue): GridCell | null {
  const rows = buildNightlifeRows(item)
  const finePrint = buildFinePrint(item)
  if (rows.length === 0 && finePrint.length === 0) return null

  return {
    key: 'nightlife-details',
    icon: <Music2 className={accentClass} strokeWidth={1.75} aria-hidden />,
    node: (
      <ItineraryDetailsModal
        venueTitle={item.title}
        heading="Nightlife details"
        rows={rows}
        finePrint={finePrint}
      />
    ),
  }
}
