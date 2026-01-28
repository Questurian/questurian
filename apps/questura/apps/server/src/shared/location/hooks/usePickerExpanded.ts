/**
 * Hook to manage location picker's expanded/collapsed state
 *
 * Handles:
 * - isExpanded: Whether the picker dropdown is open
 * - Done button detection: Detects when user closes the picker after selecting a location
 * - Finalization tracking: Used to signal form that location selection is complete
 *
 * Returns:
 * - isExpanded: Current expansion state
 * - setIsExpanded: Function to toggle expansion
 * - doneWasClicked: True when user clicked "Done" (expanded → collapsed with value)
 */

import { useEffect, useRef, useState } from 'react'

interface UsePickerExpandedReturn {
  isExpanded: boolean
  setIsExpanded: (expanded: boolean) => void
  doneWasClicked: boolean
}

export const usePickerExpanded = (value: string): UsePickerExpandedReturn => {
  const [isExpanded, setIsExpanded] = useState(false)

  // Track previous isExpanded state to detect Done button clicks
  // When user goes from expanded (true) → collapsed (false), that's a Done click
  const prevExpandedRef = useRef(isExpanded)
  const [doneWasClicked, setDoneWasClicked] = useState(false)

  /**
   * Detect when user clicks "Done" button (expanded → collapsed transition)
   * Also resets finalization flag if user re-opens the picker
   */
  useEffect(() => {
    // Done button click: expanded went from true → false with a value selected
    if (prevExpandedRef.current && !isExpanded && value) {
      setDoneWasClicked(true)
    }

    // User re-opened picker: reset finalization flag
    if (!prevExpandedRef.current && isExpanded) {
      setDoneWasClicked(false)
    }

    // Update ref for next cycle
    prevExpandedRef.current = isExpanded
  }, [isExpanded, value])

  return {
    isExpanded,
    setIsExpanded,
    doneWasClicked,
  }
}
