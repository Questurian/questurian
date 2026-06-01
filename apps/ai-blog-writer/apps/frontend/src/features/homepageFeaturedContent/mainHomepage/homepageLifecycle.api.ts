import { mainHomepageRequest } from './request'
import type { MainHomepageResponse } from './types'

export async function fetchMainHomepage(
  token: string,
  signal?: AbortSignal,
): Promise<MainHomepageResponse> {
  return mainHomepageRequest('/api/homepage-featured-content', token, { signal })
}

export async function publishMainHomepage(token: string): Promise<MainHomepageResponse> {
  return mainHomepageRequest('/api/homepage-featured-content/publish', token, {
    method: 'POST',
  })
}
