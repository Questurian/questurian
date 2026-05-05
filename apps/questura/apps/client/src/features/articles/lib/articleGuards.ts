import type { Article } from '../types'
import type { MapsListicleArticle } from '../types/mapsListicle'

export type PublicFetchedArticle = Article | MapsListicleArticle

export function isStandardArticle(doc: PublicFetchedArticle): doc is Article {
  return 'headerSection' in doc && Array.isArray((doc as Article).contentBlocks)
}
