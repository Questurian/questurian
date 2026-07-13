import type { CollectionBeforeChangeHook } from 'payload'
import { getExpectedBunnyOriginalUrl } from '@/features/media/lib/bunny-original-url'

export const BUNNY_ORIGINAL_URL_SYNC_CONTEXT_KEY = 'skipBunnyOriginalUrlSync'

/**
 * Keeps `bunny_original_url` in sync for OG-sized (1200x630) assets.
 *
 * This runs in beforeChange (not afterChange with a nested update) on
 * purpose: since plugin-cloud-storage 3.79 file uploads happen in an
 * afterChange hook, and a nested `payload.update` issued from another
 * afterChange hook still carries the request's incoming file, the plugin
 * treats it as a file replacement and deletes the "previous" file from Bunny
 * before it was ever uploaded — failing the whole create with
 * "Couldn't delete file". Setting the value before the document is written
 * avoids the nested update entirely.
 */
export const syncBunnyOriginalUrl: CollectionBeforeChangeHook = ({ data, originalDoc, req }) => {
  if (!data) return data

  const context = (req.context as Record<string, unknown> | undefined) ?? {}
  if (context[BUNNY_ORIGINAL_URL_SYNC_CONTEXT_KEY] === true) return data

  const merged: Record<string, unknown> = {
    ...((originalDoc as Record<string, unknown> | undefined) ?? {}),
    ...(data as Record<string, unknown>),
  }

  const expectedUrl = getExpectedBunnyOriginalUrl(merged)
  const currentUrl =
    typeof merged.bunny_original_url === 'string' ? merged.bunny_original_url : null

  if (currentUrl !== expectedUrl) {
    ;(data as Record<string, unknown>).bunny_original_url = expectedUrl
  }

  return data
}
