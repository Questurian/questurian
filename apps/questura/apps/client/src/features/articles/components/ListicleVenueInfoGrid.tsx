import type { JSX } from 'react'
import {
  Calendar,
  Clock,
  Globe,
  MapPin,
  Phone,
  UtensilsCrossed,
} from 'lucide-react'
import {
  formatListiclePhone,
  isHttpUrl,
  parseListicleOperationHoursRows,
} from '@/features/articles/lib/listicleVenueFormatters'
import { ListicleHoursModalTrigger } from '@/features/articles/components/ListicleHoursModalTrigger'
import type { ListicleVenue } from '@/features/articles/types/mapsListicle'

const accentClass = 'text-[var(--maps-listicle-accent)] shrink-0 size-[17px] 480:size-[18px] sm:size-[19px]'
const linkClass = 'break-words font-medium text-[12px] 480:text-[13px] sm:text-[14px] text-[var(--maps-listicle-accent)]'
const labelClass = 'text-[12px] 480:text-[13px] sm:text-[14px] leading-snug text-[var(--maps-listicle-accent)]'

type GridCell = {
  key: string
  icon: JSX.Element
  node: JSX.Element
}

function normalizeWebsiteUrl(url: string): string {
  const t = url.trim()
  if (!t) {
    return t
  }
  return isHttpUrl(t) ? t : `https://${t}`
}

export function ListicleVenueInfoGrid({ item }: { item: ListicleVenue }): JSX.Element | null {
  const addressRaw = typeof item.address === 'string' ? item.address.trim() : ''
  const phoneDisplay = formatListiclePhone(item.countryCode, item.phoneNumber)
  const hoursRows = parseListicleOperationHoursRows(item.operationHours)
  const websiteRaw = typeof item.website === 'string' ? item.website.trim() : ''
  const menuRaw = typeof item.menuUrl === 'string' ? item.menuUrl.trim() : ''
  const reserveRaw = typeof item.reservationUrl === 'string' ? item.reservationUrl.trim() : ''

  const cells: GridCell[] = []

  if (addressRaw) {
    const isMap = isHttpUrl(addressRaw)
    cells.push({
      key: 'address',
      icon: <MapPin className={accentClass} strokeWidth={1.75} aria-hidden />,
      node: isMap ? (
        <a
          href={addressRaw}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
        >
          Directions
        </a>
      ) : (
        <span className={labelClass}>{addressRaw}</span>
      ),
    })
  }

  if (phoneDisplay) {
    const tel = phoneDisplay.replace(/[^\d+]/g, '')
    cells.push({
      key: 'phone',
      icon: <Phone className={accentClass} strokeWidth={1.75} aria-hidden />,
      node: (
        <a href={`tel:${tel}`} className={linkClass}>
          {phoneDisplay}
        </a>
      ),
    })
  }

  if (hoursRows && hoursRows.length > 0) {
    cells.push({
      key: 'hours',
      icon: <Clock className={accentClass} strokeWidth={1.75} aria-hidden />,
      node: (
        <ListicleHoursModalTrigger venueTitle={item.title} rows={hoursRows} />
      ),
    })
  }

  if (websiteRaw) {
    const href = normalizeWebsiteUrl(websiteRaw)
    cells.push({
      key: 'website',
      icon: <Globe className={accentClass} strokeWidth={1.75} aria-hidden />,
      node: (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
        >
          Visit website
        </a>
      ),
    })
  }

  if (menuRaw) {
    const href = normalizeWebsiteUrl(menuRaw)
    cells.push({
      key: 'menu',
      icon: (
        <UtensilsCrossed className={accentClass} strokeWidth={1.75} aria-hidden />
      ),
      node: (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
        >
          View menu
        </a>
      ),
    })
  }

  if (reserveRaw) {
    const href = normalizeWebsiteUrl(reserveRaw)
    cells.push({
      key: 'reserve',
      icon: (
        <Calendar className={accentClass} strokeWidth={1.75} aria-hidden />
      ),
      node: (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
        >
          Reserve a table
        </a>
      ),
    })
  }

  if (cells.length === 0) {
    return null
  }

  const lastSolo = cells.length % 2 === 1

  return (
    <div className="mt-3 overflow-hidden rounded-sm border border-foreground/12 bg-foreground/[0.07] sm:mt-4 sm:rounded">
      <div className="grid grid-cols-2 gap-px bg-foreground/12">
        {cells.map((c, i) => (
          <div
            key={c.key}
            className={`flex gap-2.5 bg-background px-3 py-2.5 380:px-3.5 380:py-3 480:px-4 480:py-3.5 480:gap-3 sm:px-5 sm:py-4 sm:gap-3.5 768:px-6 768:py-5 ${
              lastSolo && i === cells.length - 1 ? 'col-span-2' : ''
            }`}
          >
            <span className="mt-0.5">{c.icon}</span>
            <div className="min-w-0 flex-1">{c.node}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
