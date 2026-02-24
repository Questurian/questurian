import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'
import {
  buildHeadingStructureHint,
  findNewHeadingViolation,
  formatHeadingRestrictionMessage,
  getRootHeadingLevel,
} from '../services/heading-structure.service'

type UseHeadingStructureGuardParams = {
  blockId: string
  value: string
  enforceHeadingStructure: boolean
  draftMarkdownRef: MutableRefObject<string>
  commitMarkdown: (nextMarkdown: string) => void
}

type UseHeadingStructureGuardResult = {
  headingStructureHint: string | null
  headingRestrictionMessage: string | null
  setHeadingRestrictionMessage: (value: string | null) => void
  applyValueWithHeadingGuard: (nextValue: string) => boolean
}

export function useHeadingStructureGuard({
  blockId,
  value,
  enforceHeadingStructure,
  draftMarkdownRef,
  commitMarkdown,
}: UseHeadingStructureGuardParams): UseHeadingStructureGuardResult {
  const lastInitializedBlockIdRef = useRef<string | null>(null)
  const [rootHeadingLevel, setRootHeadingLevel] = useState<number | null>(() =>
    enforceHeadingStructure ? getRootHeadingLevel(value) : null,
  )
  const [headingRestrictionMessage, setHeadingRestrictionMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!enforceHeadingStructure) {
      lastInitializedBlockIdRef.current = null
      setRootHeadingLevel(null)
      setHeadingRestrictionMessage(null)
      return
    }

    if (lastInitializedBlockIdRef.current === blockId) return

    lastInitializedBlockIdRef.current = blockId
    setRootHeadingLevel(getRootHeadingLevel(value))
    setHeadingRestrictionMessage(null)
  }, [blockId, enforceHeadingStructure, value])

  const headingStructureHint = useMemo(() => {
    if (!enforceHeadingStructure || rootHeadingLevel === null) return null
    return buildHeadingStructureHint(rootHeadingLevel)
  }, [enforceHeadingStructure, rootHeadingLevel])

  const applyValueWithHeadingGuard = useCallback(
    (nextValue: string): boolean => {
      const previousValue = draftMarkdownRef.current

      if (!enforceHeadingStructure || rootHeadingLevel === null) {
        setHeadingRestrictionMessage(null)
        commitMarkdown(nextValue)
        return true
      }

      const violation = findNewHeadingViolation(previousValue, nextValue, rootHeadingLevel)
      if (violation) {
        setHeadingRestrictionMessage(formatHeadingRestrictionMessage(rootHeadingLevel, violation.level))
        return false
      }

      setHeadingRestrictionMessage(null)
      commitMarkdown(nextValue)
      return true
    },
    [commitMarkdown, draftMarkdownRef, enforceHeadingStructure, rootHeadingLevel],
  )

  return {
    headingStructureHint,
    headingRestrictionMessage,
    setHeadingRestrictionMessage,
    applyValueWithHeadingGuard,
  }
}
