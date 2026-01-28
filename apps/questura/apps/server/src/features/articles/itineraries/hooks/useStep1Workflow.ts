'use client'

/**
 * useStep1Workflow Hook
 *
 * Encapsulates the state machine logic for the multi-step itinerary form workflow.
 *
 * Responsibilities:
 * - Manage Step 1 field validation (title + location)
 * - Track state transitions (incomplete → complete → update → confirmed)
 * - Manage lock/unlock states
 * - Handle confirmation when location changes (potential data mismatch)
 */

import { useCallback, useMemo, useState, useRef, useEffect } from 'react'
import { useField, useFormFields } from '@payloadcms/ui'

interface ValidationError {
  field: string
  message: string
}

interface PendingChange {
  field: 'location'
  newValue: string
  oldValue: string
}

/**
 * Configuration object returned by the hook
 */
interface Step1WorkflowState {
  // Form field values
  title: string | undefined
  location: string | undefined
  step1_complete: boolean | undefined
  in_update_mode: boolean | undefined

  // Computed state
  isStep1Complete: boolean

  // Validation
  validationErrors: ValidationError[]

  // Dialog state
  showConfirmDialog: boolean
  pendingChange: PendingChange | null

  // Handlers
  handleContinue: () => Promise<void>
  handleUpdate: () => Promise<void>
  handleSaveChanges: () => Promise<void>
  handleCancelUpdate: () => Promise<void>
  handleConfirmChange: () => Promise<void>
  handleCancelChange: () => void
}

/**
 * Hook that manages the entire Step 1 workflow state machine
 *
 * @returns {Step1WorkflowState} Complete workflow state and handlers
 */
export const useStep1Workflow = (): Step1WorkflowState => {
  // ===========================
  // 1. READ FORM STATE
  // ===========================
  const { title, location, step1_complete, in_update_mode } = useFormFields(
    ([fields]) => ({
      title: fields.title?.value as string | undefined,
      location: fields.location?.value as string | undefined,
      step1_complete: fields.step1_complete?.value as boolean | undefined,
      in_update_mode: fields.in_update_mode?.value as boolean | undefined,
    })
  )

  // ===========================
  // 2. GET FIELD SETTERS
  // ===========================
  const { setValue: setStep1Complete } = useField<boolean>({ path: 'step1_complete' })
  const { setValue: setInUpdateMode } = useField<boolean>({ path: 'in_update_mode' })
  const { setValue: setItems } = useField<any[]>({ path: 'items' })

  // ===========================
  // 3. MANAGE LOCAL STATE
  // ===========================
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([])
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(null)

  // ===========================
  // 4. TRACK PREVIOUS VALUES
  // ===========================
  // Used to detect when location changes
  const prevLocationRef = useRef<string | undefined>(location)

  // ===========================
  // 5. COMPUTED STATE
  // ===========================
  // Check if all Step 1 fields are filled
  const isStep1Complete = useMemo(
    () => Boolean(title && location),
    [title, location]
  )

  // ===========================
  // 6. DETECT CHANGES IN UPDATE MODE
  // ===========================
  // When user is updating Step 1 and changes location,
  // show confirmation dialog to warn they'll lose items (since filtering depends on location)
  useEffect(() => {
    if (!in_update_mode || !step1_complete) return

    // Check if location changed
    if (prevLocationRef.current && location && prevLocationRef.current !== location) {
      setPendingChange({
        field: 'location',
        oldValue: prevLocationRef.current,
        newValue: location,
      })
      setShowConfirmDialog(true)
      return
    }

    // Update tracking refs (no change detected)
    prevLocationRef.current = location
  }, [location, in_update_mode, step1_complete])

  // ===========================
  // 7. VALIDATION
  // ===========================
  const validateStep1 = useCallback((): boolean => {
    const errors: ValidationError[] = []

    if (!title) errors.push({ field: 'title', message: 'Title is required' })
    if (!location) errors.push({ field: 'location', message: 'Location is required' })

    setValidationErrors(errors)
    return errors.length === 0
  }, [title, location])

  // ===========================
  // 8. HANDLERS
  // ===========================

  /**
   * Handle Continue button click
   * Validates Step 1 fields and marks form as ready for Step 2+
   */
  const handleContinue = useCallback(async () => {
    if (!validateStep1()) {
      return
    }

    // Mark Step 1 as complete - this will hide Continue button
    // and show Step 2+ fields
    await setStep1Complete(true)
  }, [validateStep1, setStep1Complete])

  /**
   * Handle Update button click
   * Allows user to go back and edit Step 1 fields
   */
  const handleUpdate = useCallback(async () => {
    setValidationErrors([])
    await setInUpdateMode(true)
    // Reset tracking refs
    prevLocationRef.current = location
  }, [setInUpdateMode, location])

  /**
   * Handle Save Changes button click
   * Validates Step 1 fields and saves changes, then exits update mode
   */
  const handleSaveChanges = useCallback(async () => {
    if (!validateStep1()) {
      return
    }

    // Exit update mode - this will show Step 2+ fields again
    // and display "Update Setup" button instead of "Save Changes"
    await setInUpdateMode(false)
    prevLocationRef.current = location
  }, [validateStep1, setInUpdateMode, location])

  /**
   * Handle Cancel Update button click
   * Exits update mode without saving changes
   */
  const handleCancelUpdate = useCallback(async () => {
    setValidationErrors([])
    await setInUpdateMode(false)
    prevLocationRef.current = location
  }, [setInUpdateMode, location])

  /**
   * Handle confirmation dialog - user confirms clearing items
   * This is called when user changes location in update mode
   * and clicks "Clear & Continue"
   */
  const handleConfirmChange = useCallback(async () => {
    setShowConfirmDialog(false)

    // Clear items array since location changed
    // (blocks from previous location won't match new location)
    await setItems([])

    // Exit update mode to return to Step 2+ view with new location
    await setInUpdateMode(false)

    // Update tracking refs with new values
    prevLocationRef.current = location

    setPendingChange(null)
  }, [setItems, setInUpdateMode, location])

  /**
   * Handle confirmation dialog - user cancels
   * Keeps current items and reverts field changes (handled by UI revert or user action)
   */
  const handleCancelChange = useCallback(() => {
    setShowConfirmDialog(false)
    setPendingChange(null)
  }, [])

  // ===========================
  // 9. RETURN STATE
  // ===========================
  return {
    title,
    location,
    step1_complete,
    in_update_mode,
    isStep1Complete,
    validationErrors,
    showConfirmDialog,
    pendingChange,
    handleContinue,
    handleUpdate,
    handleSaveChanges,
    handleCancelUpdate,
    handleConfirmChange,
    handleCancelChange,
  }
}










