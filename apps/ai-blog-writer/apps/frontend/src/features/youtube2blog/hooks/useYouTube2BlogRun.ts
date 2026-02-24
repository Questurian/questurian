import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  clearDatabase,
  fetchDebug,
  fetchStatus,
  startFromYoutubeUrl,
  uploadCsv,
} from '../api'
import type { ResultTab } from '../types/youtube2blog.types'
import type { StatusResponse, UploadResponse } from '@shared/types'

type InputMode = 'url' | 'csv'

function resolveMutationError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return fallback
}

export function useYouTube2BlogRun() {
  const queryClient = useQueryClient()
  const [inputMode, setInputMode] = useState<InputMode>('url')
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [runIds, setRunIds] = useState<string[]>([])
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [showDebug, setShowDebug] = useState(false)
  const [resultTab, setResultTab] = useState<ResultTab>('final')
  const [startError, setStartError] = useState<string | null>(null)

  const applyStartSuccess = (data: UploadResponse) => {
    const ids = data.run_ids ?? (data.run_id ? [data.run_id] : [])
    setRunIds(ids)
    setActiveRunId(ids[0] ?? null)
    setStartError(null)
  }

  const uploadMutation = useMutation({
    mutationFn: uploadCsv,
    onMutate: () => {
      setStartError(null)
    },
    onSuccess: applyStartSuccess,
    onError: (error) => {
      setStartError(resolveMutationError(error, 'Upload failed'))
    },
  })

  const fromUrlMutation = useMutation({
    mutationFn: startFromYoutubeUrl,
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
      setInputMode('url')
      setYoutubeUrl('')
      setRunIds([])
      setActiveRunId(null)
      setSelectedFile(null)
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

    if (inputMode === 'url') {
      const normalizedUrl = youtubeUrl.trim()
      if (!normalizedUrl) {
        setStartError('YouTube URL is required.')
        return
      }
      fromUrlMutation.mutate(normalizedUrl)
      return
    }

    if (!selectedFile) {
      setStartError('CSV file is required in CSV mode.')
      return
    }
    uploadMutation.mutate(selectedFile)
  }

  const clear = () => {
    clearMutation.mutate()
  }

  const toggleDebug = () => {
    setShowDebug((value) => !value)
  }

  const handleInputModeChange = (mode: InputMode) => {
    setInputMode(mode)
    setStartError(null)
  }

  const activeBadge = useMemo(() => {
    if (activeRunId) {
      return `Active run: ${activeRunId}`
    }
    if (fromUrlMutation.isPending) {
      return 'Fetching transcript...'
    }
    if (uploadMutation.isPending) {
      return 'Uploading CSV...'
    }
    if (inputMode === 'url' && youtubeUrl.trim()) {
      return 'URL Ready'
    }
    if (inputMode === 'csv' && selectedFile) {
      return 'File Selected'
    }
    return 'Awaiting Input'
  }, [
    activeRunId,
    fromUrlMutation.isPending,
    inputMode,
    selectedFile,
    uploadMutation.isPending,
    youtubeUrl,
  ])

  const startPending = uploadMutation.isPending || fromUrlMutation.isPending

  return {
    inputMode,
    setInputMode: handleInputModeChange,
    youtubeUrl,
    setYoutubeUrl,
    selectedFile,
    setSelectedFile,
    runIds,
    activeRunId,
    setActiveRunId,
    showDebug,
    resultTab,
    setResultTab,
    activeStatus,
    debugData: debugQuery.data,
    activeBadge,
    handleSubmit,
    clear,
    toggleDebug,
    startPending,
    startError,
    clearPending: clearMutation.isPending,
  }
}
