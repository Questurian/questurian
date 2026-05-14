import type { CollectionAfterChangeHook } from 'payload'
import { getExpectedBunnyOriginalUrl } from '@/features/media/lib/bunny-original-url'

const BUNNY_ORIGINAL_URL_SYNC_CONTEXT_KEY = 'skipBunnyOriginalUrlSync'

export const syncBunnyOriginalUrl: CollectionAfterChangeHook = async ({ doc, req }) => {
  const context = (req.context as Record<string, unknown> | undefined) ?? {}
  if (context[BUNNY_ORIGINAL_URL_SYNC_CONTEXT_KEY] === true) return

  const docRecord = (doc as Record<string, unknown> | undefined) ?? {}
  const assetId = docRecord.id as string | number | undefined
  if (assetId === undefined) return

  const expectedUrl = getExpectedBunnyOriginalUrl(docRecord)
  const currentUrl =
    typeof docRecord.bunny_original_url === 'string' ? docRecord.bunny_original_url : null

  if (currentUrl === expectedUrl) return

  await req.payload.update({
    collection: 'media-assets',
    id: assetId,
    data: {
      bunny_original_url: expectedUrl,
    },
    disableTransaction: true,
    overrideAccess: true,
    req,
    context: {
      ...context,
      [BUNNY_ORIGINAL_URL_SYNC_CONTEXT_KEY]: true,
    },
  })
}
