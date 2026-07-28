import { useCallback, useEffect, useState } from 'react'
import type { MutableRefObject } from 'react'
import { resolveActiveToolbarKeys } from '../services/active-format.service'
import type { ToolbarActionKey } from '../types'
import { getActiveBlockTag } from '../utils/editor-dom.utils'

const EMPTY_KEYS: ReadonlySet<ToolbarActionKey> = new Set<ToolbarActionKey>()

/** queryCommandState is deprecated and absent in jsdom; absent means "off". */
function queryCommandStateSafe(command: string): boolean {
  try {
    return document.queryCommandState(command)
  } catch {
    return false
  }
}

function haveSameKeys(
  a: ReadonlySet<ToolbarActionKey>,
  b: ReadonlySet<ToolbarActionKey>,
): boolean {
  if (a.size !== b.size) return false
  for (const key of a) {
    if (!b.has(key)) return false
  }
  return true
}

type UseActiveFormatParams = {
  editorRef: MutableRefObject<HTMLDivElement | null>
}

type UseActiveFormatResult = {
  activeToolbarKeys: ReadonlySet<ToolbarActionKey>
  refreshActiveFormat: () => void
}

export function useActiveFormat({ editorRef }: UseActiveFormatParams): UseActiveFormatResult {
  const [activeToolbarKeys, setActiveToolbarKeys] =
    useState<ReadonlySet<ToolbarActionKey>>(EMPTY_KEYS)

  const refreshActiveFormat = useCallback(() => {
    const editor = editorRef.current
    const anchorNode = window.getSelection()?.anchorNode ?? null

    // `selectionchange` is a document-level event, so most firings are about
    // some other element entirely.
    const next = editor && anchorNode && editor.contains(anchorNode)
      ? resolveActiveToolbarKeys({
        blockTag: getActiveBlockTag(editor),
        isBold: queryCommandStateSafe('bold'),
        isItalic: queryCommandStateSafe('italic'),
        isUnorderedList: queryCommandStateSafe('insertUnorderedList'),
        isOrderedList: queryCommandStateSafe('insertOrderedList'),
      })
      : EMPTY_KEYS

    // selectionchange fires on every caret move; only re-render on a real
    // change of formatting.
    setActiveToolbarKeys((current) => (haveSameKeys(current, next) ? current : next))
  }, [editorRef])

  useEffect(() => {
    document.addEventListener('selectionchange', refreshActiveFormat)
    return () => document.removeEventListener('selectionchange', refreshActiveFormat)
  }, [refreshActiveFormat])

  return { activeToolbarKeys, refreshActiveFormat }
}
