import type { JSX } from 'react'
import {
  Calendar,
  Clock,
  ExternalLink,
  Globe,
  MapPin,
  Phone,
  UtensilsCrossed,
} from 'lucide-react'
import {
  formatListicleAddressLabel,
  formatListiclePhone,
  isHttpUrl,
  normalizeWebsiteUrl,
  parseListicleOperationHoursRows,
} from '@/features/articles/lib/listicleVenueFormatters'
import { ListicleHoursModalTrigger } from '@/features/articles/components/ListicleHoursModalTrigger'
import type { ListicleVenue } from '@/features/articles/types/mapsListicle'

const accentClass = 'maps-listicle-info-icon text-[var(--maps-listicle-accent)] shrink-0 size-[15px] 480:size-[16px] sm:size-[17px]'
const linkClass = 'maps-listicle-info-label break-words font-light text-[12px] leading-tight text-foreground/72 hover:text-foreground focus-visible:text-foreground focus-visible:outline-none 480:text-[13px] sm:text-[14px]'

export type GridCell = {
  key: string
  icon: JSX.Element
  node: JSX.Element
}

export function ListicleVenueInfoGrid({
  item,
  extraCells = [],
  variant = 'grid',
  actionVariant = 'card',
}: {
  item: ListicleVenue
  /** Additional cells; list mode places them after address, grid mode appends them. */
  extraCells?: GridCell[]
  /** Stacked rows mirror the compact contact list used by accommodation cards. */
  variant?: 'grid' | 'list'
  /** Editorial action mirrors the accommodation card's full-width CTA. */
  actionVariant?: 'card' | 'editorial'
}): JSX.Element | null {
  const phoneDisplay = formatListiclePhone(item.countryCode, item.phoneNumber)
  const addressRaw = typeof item.address === 'string' ? item.address.trim() : ''
  const addressLabel = formatListicleAddressLabel(addressRaw, item.title)
  const hoursRows = parseListicleOperationHoursRows(item.operationHours)
  const websiteRaw = typeof item.website === 'string' ? item.website.trim() : ''
  const menuRaw = typeof item.menuUrl === 'string' ? item.menuUrl.trim() : ''
  const reserveRaw = typeof item.bookingUrl === 'string' ? item.bookingUrl.trim() : ''
  const websiteHref = websiteRaw ? normalizeWebsiteUrl(websiteRaw) : ''
  const menuHref = menuRaw ? normalizeWebsiteUrl(menuRaw) : ''
  const reserveHref = reserveRaw ? normalizeWebsiteUrl(reserveRaw) : ''

  const cells: GridCell[] = []

  if (variant === 'list' && addressRaw) {
    const addressHref = isHttpUrl(addressRaw)
      ? addressRaw
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressRaw)}`
    cells.push({
      key: 'address',
      icon: <MapPin className={accentClass} strokeWidth={1.75} aria-hidden />,
      node: (
        <a
          href={addressHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${addressLabel ?? addressRaw} (opens in a new tab)`}
          className={`${linkClass} itinerary-stay-info-address inline-flex max-w-full items-center gap-1.5`}
        >
          <span className="min-w-0 break-words">{addressLabel ?? addressRaw}</span>
          <ExternalLink className="size-[0.65rem] shrink-0" strokeWidth={1.8} aria-hidden />
        </a>
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
    cells.push({
      key: 'website',
      icon: <Globe className={accentClass} strokeWidth={1.75} aria-hidden />,
      node: (
        <a
          href={websiteHref}
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
    cells.push({
      key: 'menu',
      icon: (
        <UtensilsCrossed className={accentClass} strokeWidth={1.75} aria-hidden />
      ),
      node: (
        <a
          href={menuHref}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
        >
          View menu
        </a>
      ),
    })
  }

  if (variant === 'list') {
    cells.splice(addressRaw ? 1 : 0, 0, ...extraCells)
  } else {
    cells.push(...extraCells)
  }

  if (cells.length === 0 && !reserveHref) {
    return null
  }

  const lastSolo = cells.length % 2 === 1

  return (
    <div className="mt-3 space-y-3 sm:mt-4 sm:space-y-4">
      {cells.length > 0 ? (
        variant === 'list' ? (
          <div className="maps-listicle-info-list">
            {cells.map((c) => (
              <div
                key={c.key}
                className="maps-listicle-info-row group flex min-h-12 items-center gap-3 border-b border-foreground/15 px-1 py-3 480:min-h-13 480:gap-3.5 480:px-1.5 480:py-3.5 sm:min-h-14 sm:px-2"
              >
                <span>{c.icon}</span>
                <div className="min-w-0 flex-1">{c.node}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-hidden rounded-sm border border-foreground/12 bg-foreground/[0.07] sm:rounded">
            <div className="grid grid-cols-2 gap-px bg-foreground/12">
              {cells.map((c, i) => (
                <div
                  key={c.key}
                  className={`maps-listicle-utility-cell group flex items-center gap-2.5 px-3 py-2.5 380:px-3.5 480:gap-3 480:px-4 480:py-3 sm:px-4 sm:py-3.5 768:px-5 768:py-3.5 ${
                    lastSolo && i === cells.length - 1 ? 'col-span-2' : ''
                  }`}
                >
                  <span>{c.icon}</span>
                  <div className="min-w-0 flex-1">{c.node}</div>
                </div>
              ))}
            </div>
          </div>
        )
      ) : null}

      {reserveHref ? (
        actionVariant === 'editorial' ? (
          <a
            href={reserveHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-14 w-full items-center justify-center rounded-none bg-[#111111] px-5 font-[var(--font-dm-sans)] text-[0.9rem] font-light leading-none tracking-[0.015em] text-white transition-colors duration-150 ease-out hover:bg-[#3B5BDB] active:bg-[#3451C7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B5BDB]/50 focus-visible:ring-offset-2 motion-reduce:transition-none"
          >
            RESERVE A TABLE
          </a>
        ) : (
          <div className="maps-listicle-reserve-card">
            <a
              href={reserveHref}
              target="_blank"
              rel="noopener noreferrer"
              className="maps-listicle-reserve-button"
            >
              <Calendar className="size-[16px] shrink-0 480:size-[17px] sm:size-[18px]" strokeWidth={1.8} aria-hidden />
              <span>Reserve a table</span>
            </a>
          </div>
        )
      ) : null}
    </div>
  )
}
