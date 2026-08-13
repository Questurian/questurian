import { useEffect, useMemo, useState } from 'react'

import { fetchMediaAssets as fetchPayloadMediaAssets } from '../../../../shared/api/payload/payload.api'
import type { ItineraryItemBlock, MediaAssetOption } from '../../types'
import { isManualItineraryBlockType } from '../../types'

export function useManualStopImageAssets({
  items,
  mediaAssets,
}: {
  items: ItineraryItemBlock[]
  mediaAssets: MediaAssetOption[]
}): Record<number, MediaAssetOption> {
  const [fetchedManualImageAssets, setFetchedManualImageAssets] = useState<Record<number, MediaAssetOption>>({})

  const missingManualImageIds = useMemo(() => {

    const loadedIds = new Set<number>([
      ...mediaAssets.map((asset) => asset.id),
      ...Object.keys(fetchedManualImageAssets).map((id) => Number(id)),
    ])

    return Array.from(new Set(
      items
        .filter((item) => isManualItineraryBlockType(item.blockType) && typeof item.image === 'number')
        .map((item) => item.image)
        .filter((imageId): imageId is number => typeof imageId === 'number' && !loadedIds.has(imageId)),
    ))
  }, [fetchedManualImageAssets, items, mediaAssets])

  useEffect(() => {
    if (missingManualImageIds.length === 0) return

    let cancelled = false

    const hydrateManualImages = async () => {
      const responses = await Promise.all(
        missingManualImageIds.map(async (imageId) => {
          try {
            const response = await fetchPayloadMediaAssets({
              id: imageId,
              limit: 1,
            })
            return response.docs[0] || null
          } catch {
            return null
          }
        }),
      )

      if (cancelled) return

      const hydratedAssets = responses
        .filter((asset): asset is NonNullable<(typeof responses)[number]> => Boolean(asset))
        .map((asset) => ({
          id: asset.id,
          filename: asset.filename,
          alt: asset.alt ?? undefined,
          alt_text: asset.alt_text ?? undefined,
          altText: asset.altText ?? undefined,
          mediaSet: asset.mediaSet,
          url: asset.url ?? undefined,
          variant: asset.variant ?? undefined,
        } satisfies MediaAssetOption))
      if (hydratedAssets.length < 1) return

      setFetchedManualImageAssets((current) => {
        const next = { ...current }
        hydratedAssets.forEach((asset) => {
          next[asset.id] = asset
        })
        return next
      })
    }

    void hydrateManualImages()

    return () => {
      cancelled = true
    }
  }, [missingManualImageIds])

  return fetchedManualImageAssets
}
