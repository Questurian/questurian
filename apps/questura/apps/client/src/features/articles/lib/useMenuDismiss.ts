'use client'

import { useEffect, type RefObject } from 'react'

/**
 * Closes an open menu on an outside pointer press or Escape.
 *
 * Listens on pointerdown rather than click so a press that starts outside
 * closes the menu before the map underneath treats it as a map gesture.
 */
export function useMenuDismiss(
  open: boolean,
  close: () => void,
  ref: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node && ref.current?.contains(target)) return
      close()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, close, ref])
}
