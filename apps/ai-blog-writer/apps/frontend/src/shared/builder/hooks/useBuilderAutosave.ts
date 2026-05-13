import { useEffect } from 'react'

export function useBuilderAutosave<TDraft>(
  draft: TDraft | null,
  save: (draft: TDraft) => void,
  delay = 400,
): void {
  useEffect(() => {
    if (!draft) return

    const timer = window.setTimeout(() => {
      save(draft)
    }, delay)

    return () => window.clearTimeout(timer)
  }, [draft, save, delay])
}
