import { useCallback, useEffect, useState } from 'react'

export type ClipboardCopyStatus = 'idle' | 'copied' | 'error'

const COPY_LABELS: Record<ClipboardCopyStatus, string> = {
  idle: 'Copy prompt',
  copied: 'Copied!',
  error: 'Copy failed',
}

/**
 * One clipboard affordance for every prompt the composer hands to a chatbot.
 * Clipboard access is missing outside secure contexts, so the button has to
 * say so rather than silently doing nothing.
 */
export function useClipboardCopy() {
  const [status, setStatus] = useState<ClipboardCopyStatus>('idle')

  useEffect(() => {
    if (status === 'idle') return
    const timer = setTimeout(() => setStatus('idle'), 2000)
    return () => clearTimeout(timer)
  }, [status])

  const copy = useCallback((text: string | null) => {
    if (text === null) return
    const copied = navigator.clipboard?.writeText(text)
    if (!copied) {
      setStatus('error')
      return
    }
    copied.then(() => setStatus('copied')).catch(() => setStatus('error'))
  }, [])

  const reset = useCallback(() => setStatus('idle'), [])

  return { status, label: COPY_LABELS[status], copy, reset }
}
