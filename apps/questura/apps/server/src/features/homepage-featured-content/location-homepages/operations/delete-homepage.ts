import {
  deleteLocationHomepageDocument,
  getLocationHomepagePayload,
} from '../lib/persistence'
import type { LocationHomepageOperationResult } from '../types'

export async function deleteLocationHomepage(
  id: string,
): Promise<LocationHomepageOperationResult<{ deleted: true }>> {
  const payload = await getLocationHomepagePayload()
  await deleteLocationHomepageDocument(payload, id)

  return { status: 200, body: { deleted: true } }
}
