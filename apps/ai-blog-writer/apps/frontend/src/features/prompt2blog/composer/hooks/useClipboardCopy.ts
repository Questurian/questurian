import { useCallback, useEffect, useState } from 'react'

export type ClipboardCopyStatus = 'idle' | 'copied' | 'error'

const RESOLVED_LABELS: Record<Exclude<ClipboardCopyStatus, 'idle'>, string> = {
  copied: 'Copied!',
  error: 'Copy failed',
}

/**
 * One clipboard affordance for every prompt the composer hands to a chatbot,
 * and for the evidence package it hands back. Clipboard access is missing
 * outside secure contexts, so the button has to say so rather than silently
 * doing nothing.
 *
 * `idleLabel` names what is being copied. Most callers copy a prompt and take
 * the default; the evidence package is the one thing on this page a user
 * needs out of the app rather than into a chatbot, so it says so.
 */
export function useClipboardCopy(idleLabel = 'Copy prompt') {
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

  return {
    status,
    label: status === 'idle' ? idleLabel : RESOLVED_LABELS[status],
    copy,
    reset,
  }
}
