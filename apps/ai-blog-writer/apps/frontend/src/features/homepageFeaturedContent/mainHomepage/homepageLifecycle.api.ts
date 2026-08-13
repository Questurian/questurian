import { mainHomepageRequest } from './request'
import type { MainHomepageResponse } from './types'

export async function fetchMainHomepage(
  signal?: AbortSignal,
): Promise<MainHomepageResponse> {
  return mainHomepageRequest('/api/homepage-featured-content', { signal })
}

export async function publishMainHomepage(): Promise<MainHomepageResponse> {
  return mainHomepageRequest('/api/homepage-featured-content/publish', {
    method: 'POST',
  })
}
