import { useMemo } from 'react'
import {
  buildHeadingStructureHint,
  findRestrictedHeadings,
  formatHeadingStructureWarning,
  getRootHeadingLevel,
} from '../services/heading-structure.service'

type UseHeadingStructureGuardParams = {
  value: string
  enforceHeadingStructure: boolean
}

type UseHeadingStructureGuardResult = {
  headingStructureHint: string | null
  headingStructureWarning: string | null
}

/**
 * Advisory heading-structure state for the block being edited.
 *
 * This used to gate every commit: a keystroke that introduced a sibling heading
 * was rejected, the editor's innerHTML was rebuilt from the last good draft and
 * the caret was thrown to the end of the block. That silently ate the author's
 * text — mid-paragraph edits reappeared at the bottom — and wiped the native
 * undo stack on the way. It also swallowed AI rewrites whole.
 *
 * Structure is a suggestion, not an invariant, so it is now derived state:
 * everything commits, and a violation only produces a message. Deriving the
 * anchor level from the live value (rather than freezing it per block id) also
 * keeps it honest after a split or an AI rewrite changes the first heading.
 */
export function useHeadingStructureGuard({
  value,
  enforceHeadingStructure,
}: UseHeadingStructureGuardParams): UseHeadingStructureGuardResult {
  const rootHeadingLevel = useMemo(
    () => (enforceHeadingStructure ? getRootHeadingLevel(value) : null),
    [enforceHeadingStructure, value],
  )

  const headingStructureHint = useMemo(() => {
    if (rootHeadingLevel === null) return null
    return buildHeadingStructureHint(rootHeadingLevel)
  }, [rootHeadingLevel])

  const headingStructureWarning = useMemo(() => {
    if (rootHeadingLevel === null) return null
    const [restricted] = findRestrictedHeadings(value, rootHeadingLevel)
    if (!restricted) return null
    return formatHeadingStructureWarning(rootHeadingLevel, restricted.level)
  }, [rootHeadingLevel, value])

  return { headingStructureHint, headingStructureWarning }
}
