import type { Article } from '../types'
import type { ListicleItineraryArticle } from '../types/itineraryListicle'
import type { MapsListicleArticle } from '../types/mapsListicle'

export type PublicFetchedArticle =
  | Article
  | MapsListicleArticle
  | ListicleItineraryArticle

export function isStandardArticle(doc: PublicFetchedArticle): doc is Article {
  return 'headerSection' in doc && Array.isArray((doc as Article).contentBlocks)
}
