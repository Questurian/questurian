import { isHttpUrl } from '@/features/articles/lib/listicleVenueFormatters'
import type {
  ListicleTourImage,
  ListicleTourPick,
} from '@/features/articles/types/mapsListicle'

/** A Tour Pick with the fields every surface needs, already validated. */
export type RenderableTourPick = {
  id: number | string
  title: string
  price: string | null
  href: string
  image: ListicleTourImage | null
}

/**
 * Tour Picks (ADR 0013) as the reading column and the map card both need
 * them: a tour without a title or a booking link is not renderable anywhere,
 * so the check lives here rather than in each surface.
 */
export function renderableTourPicks(
  tours: ListicleTourPick[] | null | undefined,
): RenderableTourPick[] {
  return (tours ?? [])
    .map((tour, index): RenderableTourPick | null => {
      const title = typeof tour?.title === 'string' ? tour.title.trim() : ''
      const link = typeof tour?.bookingLink === 'string' ? tour.bookingLink.trim() : ''
      if (!title || !link) return null

      const image =
        tour.image && typeof tour.image.url === 'string' && tour.image.url.trim()
          ? tour.image
          : null

      return {
        id: tour.id ?? `tour-${index}`,
        title,
        price:
          typeof tour.price === 'string' && tour.price.trim() ? tour.price.trim() : null,
        href: isHttpUrl(link) ? link : `https://${link}`,
        image,
      }
    })
    .filter((tour): tour is RenderableTourPick => Boolean(tour))
}
