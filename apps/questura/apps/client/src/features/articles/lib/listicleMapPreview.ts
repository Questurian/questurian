import { listicleItemHeroFromRow } from '@/features/articles/lib/listicleItemHelpers'
import {
  formatListicleAddressLabel,
  plainTextExcerpt,
} from '@/features/articles/lib/listicleVenueFormatters'
import type { ListicleMapPointPreview } from '@/features/articles/components/ListicleMapSync'
import type { ListicleItemRow } from '@/features/articles/types/mapsListicle'

/**
 * The card the mobile map takeover floats over the pins.
 *
 * Built from the same row the reading column renders, so the card and the
 * entry can never disagree about which venue a pin is.
 */
export function mapPointPreviewFromRow(row: ListicleItemRow): ListicleMapPointPreview {
  const address = typeof row.item.address === 'string' ? row.item.address.trim() : ''

  return {
    address: formatListicleAddressLabel(address, row.item.title),
    excerpt: plainTextExcerpt(row.blurb) || null,
    image: listicleItemHeroFromRow(row),
  }
}
