import type { PexelsOrientation } from '../../../api'

type SearchParams = {
  perPage: number
  page: number
  orientation?: PexelsOrientation
}

type SearchFn<TPhoto> = (
  query: string,
  params: SearchParams
) => Promise<{ photos: TPhoto[] }>

export async function searchExternalPhotos<TPhoto>(
  searchFn: SearchFn<TPhoto>,
  query: string,
  perPage: number,
  orientation: PexelsOrientation | ''
): Promise<TPhoto[]> {
  const normalizedQuery = query.trim()
  if (!normalizedQuery) {
    throw new Error('Enter a search term first.')
  }

  const response = await searchFn(normalizedQuery, {
    perPage,
    page: 1,
    orientation: orientation || undefined,
  })
  return response.photos || []
}
