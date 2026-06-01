export type CandidateQueryParams = {
  query?: string
  page?: number
  limit?: number
}

export function buildCandidateQuery(params: CandidateQueryParams): string {
  const searchParams = new URLSearchParams()

  if (params.query?.trim()) {
    searchParams.set('q', params.query.trim())
  }

  if (params.page) {
    searchParams.set('page', String(params.page))
  }

  if (params.limit) {
    searchParams.set('limit', String(params.limit))
  }

  const query = searchParams.toString()
  return query ? `?${query}` : ''
}
