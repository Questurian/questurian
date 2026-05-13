import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  clearDatabase,
  fetchArticleTypes,
  fetchDebug,
  fetchStatus,
  startFromYoutubeUrl,
} from '../api'
import type { ResultTab } from '../types/youtube2blog.types'
import type { StatusResponse, UploadResponse } from '@shared/types'
import { DEFAULT_Y2B_MODEL, type Y2BModelName } from '../../../shared/api/ai/models'

type RunInputType = 'url' | null

function resolveMutationError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return fallback
}

export function useYouTube2BlogRun() {
  const queryClient = useQueryClient()
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [selectedModel, setSelectedModel] = useState<Y2BModelName>(DEFAULT_Y2B_MODEL)
  const [forcedArticleType, setForcedArticleType] = useState('')
  const [runIds, setRunIds] = useState<string[]>([])
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [activeRunInputType, setActiveRunInputType] = useState<RunInputType>(null)
  const [showDebug, setShowDebug] = useState(false)
  const [resultTab, setResultTab] = useState<ResultTab>('final')
  const [startError, setStartError] = useState<string | null>(null)

  const applyStartSuccess = (data: UploadResponse) => {
    const ids = data.run_ids ?? (data.run_id ? [data.run_id] : [])
    setRunIds(ids)
    setActiveRunId(ids[0] ?? null)
    setActiveRunInputType(ids[0] ? 'url' : null)
    setStartError(null)
  }

  const articleTypesQuery = useQuery({
    queryKey: ['article-types'],
    queryFn: fetchArticleTypes,
    staleTime: 5 * 60 * 1000,
  })

  const fromUrlMutation = useMutation({
    mutationFn: ({
      url,
      model,
      forcedArticleType: articleType,
    }: {
      url: string
      model: string
      forcedArticleType?: string
    }) => startFromYoutubeUrl(url, model, articleType),
    onMutate: () => {
      setStartError(null)
    },
    onSuccess: applyStartSuccess,
    onError: (error) => {
      setStartError(resolveMutationError(error, 'Failed to start YouTube URL run'))
    },
  })

  const clearMutation = useMutation({
    mutationFn: clearDatabase,
    onSuccess: () => {
      setYoutubeUrl('')
      setForcedArticleType('')
      setRunIds([])
      setActiveRunId(null)
      setActiveRunInputType(null)
      setStartError(null)
    },
  })

  const statusQuery = useQuery({
    queryKey: ['status', activeRunId],
    queryFn: () => fetchStatus(activeRunId as string),
    enabled: Boolean(activeRunId),
    refetchInterval: (query) => {
      const current = query.state.data as StatusResponse | undefined
      if (!current) {
        return 1000
      }
      return current.state === 'completed' || current.state === 'failed' ? false : 1000
    },
  })

  const debugQuery = useQuery({
    queryKey: ['debug', activeRunId],
    queryFn: () => fetchDebug(activeRunId as string),
    enabled: Boolean(activeRunId),
    staleTime: 0,
  })

  const activeStatus = statusQuery.data

  useEffect(() => {
    if (activeStatus?.state === 'completed' && activeRunId) {
      queryClient.invalidateQueries({ queryKey: ['result', activeRunId] })
      queryClient.invalidateQueries({ queryKey: ['debug', activeRunId] })
    }
  }, [activeStatus?.state, activeRunId, queryClient])

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()

    const normalizedUrl = youtubeUrl.trim()
    if (!normalizedUrl) {
      setStartError('YouTube URL is required.')
      return
    }

    fromUrlMutation.mutate({ url: normalizedUrl, model: selectedModel, forcedArticleType })
  }

  const clear = () => {
    clearMutation.mutate()
  }

  const toggleDebug = () => {
    setShowDebug((value) => !value)
  }

  const activeBadge = useMemo(() => {
    if (activeRunId) {
      return `Active run: ${activeRunId}`
    }
    if (fromUrlMutation.isPending) {
      return 'Fetching transcript...'
    }
    if (youtubeUrl.trim()) {
      return 'URL Ready'
    }
    return 'Awaiting URL'
  }, [activeRunId, fromUrlMutation.isPending, youtubeUrl])

  return {
    youtubeUrl,
    setYoutubeUrl,
    selectedModel,
    setSelectedModel,
    forcedArticleType,
    setForcedArticleType,
    articleTypes: articleTypesQuery.data ?? [],
    runIds,
    activeRunId,
    setActiveRunId,
    activeRunInputType,
    showDebug,
    resultTab,
    setResultTab,
    activeStatus,
    debugData: debugQuery.data,
    activeBadge,
    handleSubmit,
    clear,
    toggleDebug,
    startPending: fromUrlMutation.isPending,
    startError,
    clearPending: clearMutation.isPending,
  }
}
