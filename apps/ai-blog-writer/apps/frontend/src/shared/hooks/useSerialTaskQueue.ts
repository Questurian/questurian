import { useCallback, useEffect, useRef, useState } from 'react'

type SerialTask<TaskId extends string> = {
  id: TaskId
  run: () => Promise<void>
}

export function useSerialTaskQueue<TaskId extends string = string>() {
  const queueRef = useRef<Array<SerialTask<TaskId>>>([])
  const isProcessingRef = useRef(false)
  const isMountedRef = useRef(true)
  const [activeTaskId, setActiveTaskId] = useState<TaskId | null>(null)
  const [queuedTaskIds, setQueuedTaskIds] = useState<TaskId[]>([])

  useEffect(() => {
    return () => {
      isMountedRef.current = false
      queueRef.current = []
    }
  }, [])

  const syncQueuedTaskIds = useCallback(() => {
    if (!isMountedRef.current) return
    setQueuedTaskIds(queueRef.current.map((task) => task.id))
  }, [])

  const processQueue = useCallback(() => {
    if (isProcessingRef.current || queueRef.current.length < 1) {
      return
    }

    const nextTask = queueRef.current.shift()
    if (!nextTask) return

    syncQueuedTaskIds()
    isProcessingRef.current = true

    if (isMountedRef.current) {
      setActiveTaskId(nextTask.id)
    }

    void Promise.resolve()
      .then(() => nextTask.run())
      .catch(() => undefined)
      .finally(() => {
        isProcessingRef.current = false

        if (isMountedRef.current) {
          setActiveTaskId(null)
        }

        processQueue()
      })
  }, [syncQueuedTaskIds])

  const enqueueTask = useCallback((task: SerialTask<TaskId>) => {
    queueRef.current.push(task)
    syncQueuedTaskIds()
    processQueue()
  }, [processQueue, syncQueuedTaskIds])

  return {
    activeTaskId,
    queuedTaskIds,
    enqueueTask,
  }
}
