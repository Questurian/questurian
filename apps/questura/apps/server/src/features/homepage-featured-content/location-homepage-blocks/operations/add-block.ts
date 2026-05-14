import {
  parseNewBlockInput,
  resolveLocationGridScope,
  type RawBlock,
} from '../../resolve-page-blocks/service'
import {
  getLocationHomepagePayload,
  loadLocationHomepage,
  updateAndFormatLocationHomepageBlocks,
} from '../../location-homepages/lib/persistence'
import type {
  FormattedLocationHomepage,
  LocationHomepageBlocksOperationResult,
} from '../types'

type ErrorBody = { message: string }

export async function addLocationHomepageBlock(
  id: string,
  body: unknown,
): Promise<LocationHomepageBlocksOperationResult<FormattedLocationHomepage | ErrorBody>> {
  const parsed = parseNewBlockInput(body)
  if (!parsed.ok) {
    return { status: parsed.status, body: { message: parsed.message } }
  }

  const payload = await getLocationHomepagePayload()
  const doc = await loadLocationHomepage(payload, id, 1)

  if (parsed.blockType === 'location-grid') {
    const scope = await resolveLocationGridScope(payload, doc.location)
    if (!scope) {
      return {
        status: 400,
        body: { message: 'Location Grid blocks are only available on city homepages.' },
      }
    }
  }

  const existingBlocks: RawBlock[] = doc.pageBlocks ?? []
  const formatted = await updateAndFormatLocationHomepageBlocks(
    payload,
    id,
    [...existingBlocks, parsed.block],
    1,
  )

  return { status: 201, body: formatted }
}
