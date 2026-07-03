import {
  formatMainHomepage,
  getMainHomepagePayload,
  loadMainHomepage,
} from '../lib/persistence'
import type { MainHomepageOperationResult } from '../types'

export async function getMainHomepage(): Promise<MainHomepageOperationResult> {
  const payload = await getMainHomepagePayload()
  const doc = await loadMainHomepage(payload)
  return { status: 200, body: await formatMainHomepage(payload, doc) }
}
