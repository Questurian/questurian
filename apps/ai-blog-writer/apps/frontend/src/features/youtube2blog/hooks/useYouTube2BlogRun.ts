import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { clearDatabase, fetchDebug, fetchStatus, uploadCsv } from '../api'
import type { ResultTab } from '../types/youtube2blog.types'
import type { StatusResponse } from '@shared/types'

export function useYouTube2BlogRun() {
  const queryClient = useQueryClient()
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [runIds, setRunIds] = useState<string[]>([])
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [showDebug, setShowDebug] = useState(false)
  const [resultTab, setResultTab] = useState<ResultTab>('final')

  const uploadMutation = useMutation({
    mutationFn: uploadCsv,
    onSuccess: (data) => {
      const ids = data.run_ids ?? (data.run_id ? [data.run_id] : [])
      setRunIds(ids)
      setActiveRunId(ids[0] ?? null)
    },
  })

  const clearMutation = useMutation({
    mutationFn: clearDatabase,
    onSuccess: () => {
      setRunIds([])
      setActiveRunId(null)
      setSelectedFile(null)
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
    if (!selectedFile) {
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

  const activeBadge = useMemo(() => {
    if (activeRunId) {
      return `Active run: ${activeRunId}`
    }
    if (uploadMutation.isPending) {
      return 'Uploading...'
    }
    if (selectedFile) {
      return 'File Selected'
    }
    return 'Awaiting Upload'
  }, [activeRunId, selectedFile, uploadMutation.isPending])

  return {
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
    uploadPending: uploadMutation.isPending,
    uploadError: uploadMutation.isError,
    clearPending: clearMutation.isPending,
  }
}
