import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getArticleById } from '../../staging/api'
import type { PayloadPublicationStatus } from '../utils/articles-status.utils'

const EMPTY_PAYLOAD_STATUS_BY_ARTICLE_ID: Record<number, PayloadPublicationStatus | undefined> = {}

export type UsePayloadPublicationStatusesOptions = {
  featureKey: string
  payloadArticleIds: number[]
  token: string | null | undefined
}

export type UsePayloadPublicationStatusesResult = {
  payloadStatusByArticleId: Record<number, PayloadPublicationStatus>
  isFetching: boolean
}

/**
 * Fetches Payload publication status for the given article ids and keeps a sticky
 * "last known" cache, so a status that fails to refresh keeps its prior value
 * instead of flickering back to an unknown/Draft state.
 */
export function usePayloadPublicationStatuses({
  featureKey,
  payloadArticleIds,
  token,
}: UsePayloadPublicationStatusesOptions): UsePayloadPublicationStatusesResult {
  const [lastKnownPayloadStatusByArticleId, setLastKnownPayloadStatusByArticleId] = useState<
    Record<number, PayloadPublicationStatus>
  >({})

  const payloadStatusesQuery = useQuery({
    queryKey: [featureKey, 'payload-statuses', payloadArticleIds.join(','), token || 'no-token'],
    enabled: Boolean(token) && payloadArticleIds.length > 0,
    queryFn: async (): Promise<Record<number, PayloadPublicationStatus | undefined>> => {
      const entries = await Promise.all(
        payloadArticleIds.map(async (payloadArticleId) => {
          try {
            const doc = await getArticleById(payloadArticleId, token as string)
            const status: PayloadPublicationStatus = doc.status === 'published' ? 'published' : 'draft'
            return [payloadArticleId, status] as const
          } catch {
            return [payloadArticleId, undefined] as const
          }
        }),
      )

      return Object.fromEntries(entries)
    },
  })

  const livePayloadStatusByArticleId = payloadStatusesQuery.data ?? EMPTY_PAYLOAD_STATUS_BY_ARTICLE_ID
  const payloadStatusByArticleId = useMemo(() => {
    const merged: Record<number, PayloadPublicationStatus> = { ...lastKnownPayloadStatusByArticleId }
    for (const [idKey, status] of Object.entries(livePayloadStatusByArticleId)) {
      if (!status) continue
      merged[Number(idKey)] = status
    }
    return merged
  }, [lastKnownPayloadStatusByArticleId, livePayloadStatusByArticleId])

  useEffect(() => {
    if (!payloadStatusesQuery.data) return
    setLastKnownPayloadStatusByArticleId((previous) => {
      const merged = { ...previous }
      let changed = false
      for (const [idKey, status] of Object.entries(payloadStatusesQuery.data)) {
        if (!status) continue
        const id = Number(idKey)
        if (merged[id] !== status) {
          merged[id] = status
          changed = true
        }
      }
      return changed ? merged : previous
    })
  }, [payloadStatusesQuery.data])

  return {
    payloadStatusByArticleId,
    isFetching: payloadStatusesQuery.isFetching,
  }
}
