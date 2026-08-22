import type { LocationGridMediaAspect } from '../../locationGridTypes'
import type {
  ArticleGridFourLayout,
  FeaturedArticlesSlot3Layout,
  FeaturedArticlesSlot4Layout,
  FeaturedArticlesSlot5Layout
} from '../../pageBlocks'
import { locationHomepageRequest } from '../request'
import type { LocationHomepageResponse } from '../types'

export async function updateLocationHomepageFeaturedSectionHeading(
  id: number,
  blockId: string,
  sectionHeading: string | null
): Promise<LocationHomepageResponse> {
  return locationHomepageRequest(`/api/location-homepages/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ blockId, sectionHeading })
  })
}

export async function updateLocationHomepageFeaturedSectionSubheading(
  id: number,
  blockId: string,
  sectionSubheading: string | null
): Promise<LocationHomepageResponse> {
  return locationHomepageRequest(`/api/location-homepages/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ blockId, sectionSubheading })
  })
}

export async function updateLocationHomepageCreatorKicker(
  id: number,
  blockId: string,
  creatorKicker: string | null
): Promise<LocationHomepageResponse> {
  return locationHomepageRequest(`/api/location-homepages/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ blockId, creatorKicker })
  })
}

export async function updateLocationHomepageFeaturedSlot3Layout(
  homepageId: number,
  blockId: string,
  slot3Layout: FeaturedArticlesSlot3Layout
): Promise<LocationHomepageResponse> {
  return locationHomepageRequest(
    `/api/location-homepages/${homepageId}`,
    {
      method: 'PUT',
      body: JSON.stringify({ blockId, slot3Layout })
    }
  )
}

export async function updateLocationHomepageFeaturedSlot4Layout(
  homepageId: number,
  blockId: string,
  slot4Layout: FeaturedArticlesSlot4Layout
): Promise<LocationHomepageResponse> {
  return locationHomepageRequest(
    `/api/location-homepages/${homepageId}`,
    {
      method: 'PUT',
      body: JSON.stringify({ blockId, slot4Layout })
    }
  )
}

export async function updateLocationHomepageFeaturedSlot5Layout(
  homepageId: number,
  blockId: string,
  slot5Layout: FeaturedArticlesSlot5Layout
): Promise<LocationHomepageResponse> {
  return locationHomepageRequest(
    `/api/location-homepages/${homepageId}`,
    {
      method: 'PUT',
      body: JSON.stringify({ blockId, slot5Layout })
    }
  )
}

export async function updateLocationHomepageLocationGridMediaAspect(
  homepageId: number,
  blockId: string,
  mediaAspect: LocationGridMediaAspect
): Promise<LocationHomepageResponse> {
  return locationHomepageRequest(
    `/api/location-homepages/${homepageId}`,
    {
      method: 'PUT',
      body: JSON.stringify({ blockId, mediaAspect })
    }
  )
}

export async function updateLocationHomepageArticleGridFourLayout(
  homepageId: number,
  blockId: string,
  articleGridFourLayout: ArticleGridFourLayout
): Promise<LocationHomepageResponse> {
  return locationHomepageRequest(
    `/api/location-homepages/${homepageId}`,
    {
      method: 'PUT',
      body: JSON.stringify({ blockId, articleGridFourLayout })
    }
  )
}
