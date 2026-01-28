/**
 * Hook to detect when a value has changed from user interaction
 * Distinguishes between initial load and actual user changes
 *
 * Returns true only when the value changes after the first render
 * Returns false on initial render and when value hasn't changed
 *
 * Usage:
 * const changed = useDetectChange(selectedCountry)
 * if (changed) {
 *   // Clear dependent selections
 * }
 */

import { useEffect, useRef } from 'react'

export const useDetectChange = (value: string): boolean => {
  const prevRef = useRef<string>('')
  const hasChangedRef = useRef<boolean>(false)

  useEffect(() => {
    // Only detect change after first render
    if (prevRef.current !== '' && prevRef.current !== value) {
      hasChangedRef.current = true
    } else {
      hasChangedRef.current = false
    }

    prevRef.current = value
  }, [value])

  return hasChangedRef.current
}
