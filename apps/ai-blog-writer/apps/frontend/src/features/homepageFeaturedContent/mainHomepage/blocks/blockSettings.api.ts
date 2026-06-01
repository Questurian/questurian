import type { LocationGridMediaAspect } from '../../locationGridTypes'
import type {
  ArticleGridFourLayout,
  FeaturedArticlesSlot3Layout,
  FeaturedArticlesSlot4Layout,
  FeaturedArticlesSlot5Layout,
} from '../../pageBlocks'
import { mainHomepageRequest } from '../request'
import type { MainHomepageResponse } from '../types'

export async function updateMainHomepageFeaturedSectionHeading(
  token: string,
  blockId: string,
  sectionHeading: string | null,
): Promise<MainHomepageResponse> {
  return mainHomepageRequest('/api/homepage-featured-content', token, {
    method: 'PUT',
    body: JSON.stringify({ blockId, sectionHeading }),
  })
}

export async function updateMainHomepageFeaturedSectionSubheading(
  token: string,
  blockId: string,
  sectionSubheading: string | null,
): Promise<MainHomepageResponse> {
  return mainHomepageRequest('/api/homepage-featured-content', token, {
    method: 'PUT',
    body: JSON.stringify({ blockId, sectionSubheading }),
  })
}

export async function updateMainHomepageFeaturedSlot3Layout(
  token: string,
  blockId: string,
  slot3Layout: FeaturedArticlesSlot3Layout,
): Promise<MainHomepageResponse> {
  return mainHomepageRequest('/api/homepage-featured-content', token, {
    method: 'PUT',
    body: JSON.stringify({ blockId, slot3Layout }),
  })
}

export async function updateMainHomepageFeaturedSlot4Layout(
  token: string,
  blockId: string,
  slot4Layout: FeaturedArticlesSlot4Layout,
): Promise<MainHomepageResponse> {
  return mainHomepageRequest('/api/homepage-featured-content', token, {
    method: 'PUT',
    body: JSON.stringify({ blockId, slot4Layout }),
  })
}

export async function updateMainHomepageFeaturedSlot5Layout(
  token: string,
  blockId: string,
  slot5Layout: FeaturedArticlesSlot5Layout,
): Promise<MainHomepageResponse> {
  return mainHomepageRequest('/api/homepage-featured-content', token, {
    method: 'PUT',
    body: JSON.stringify({ blockId, slot5Layout }),
  })
}

export async function updateMainHomepageLocationGridMediaAspect(
  token: string,
  blockId: string,
  mediaAspect: LocationGridMediaAspect,
): Promise<MainHomepageResponse> {
  return mainHomepageRequest('/api/homepage-featured-content', token, {
    method: 'PUT',
    body: JSON.stringify({ blockId, mediaAspect }),
  })
}

export async function updateMainHomepageArticleGridFourLayout(
  token: string,
  blockId: string,
  articleGridFourLayout: ArticleGridFourLayout,
): Promise<MainHomepageResponse> {
  return mainHomepageRequest('/api/homepage-featured-content', token, {
    method: 'PUT',
    body: JSON.stringify({ blockId, articleGridFourLayout }),
  })
}
