import {
  formatLocationHomepageWithResolvedBlocks,
  getLocationHomepagePayload,
  loadLocationHomepage,
} from '../lib/persistence'
import type {
  ErrorBody,
  FormattedLocationHomepage,
  LocationHomepageOperationResult,
} from '../types'

export async function getLocationHomepage(
  id: string,
): Promise<LocationHomepageOperationResult<FormattedLocationHomepage | ErrorBody>> {
  const payload = await getLocationHomepagePayload()
  const doc = await loadLocationHomepage(payload, id, 0)
  const formatted = await formatLocationHomepageWithResolvedBlocks(payload, doc)

  return { status: 200, body: formatted }
}
