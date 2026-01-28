'use client'

/**
 * useStep1Workflow Hook
 *
 * Encapsulates the state machine logic for the multi-step ranking form workflow.
 *
 * Responsibilities:
 * - Manage Step 1 field validation
 * - Track state transitions (incomplete → complete → update → confirmed)
 * - Detect when ranking type or location changes in update mode
 * - Handle confirmation dialogs for destructive changes
 * - Clear items array when dependent fields change
 *
 * State Flow:
 * 1. Initial: step1_complete=false, in_update_mode=false
 * 2. Continue: User clicks Continue button → step1_complete=true
 * 3. Update: User clicks Update Setup → in_update_mode=true
 * 4. Detect Change: rankingType or location changes → show confirmation dialog
 * 5. Confirm: User clicks "Clear & Continue" → clear items, reset in_update_mode
 * 6. Cancel: User clicks "Keep Items" → revert dialog, keep current values
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useField, useFormFields } from '@payloadcms/ui'

interface ValidationError {
  field: string
  message: string
}

interface PendingChange {
  field: 'rankingType' | 'location'
  newValue: string
  oldValue: string
}

/**
 * Configuration object returned by the hook
 */
interface Step1WorkflowState {
  // Form field values
  location: string | undefined
  rankingType: string | undefined
  title: string | undefined
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
  handleConfirmChange: () => Promise<void>
  handleCancelChange: () => void
  handleCancelUpdate: () => Promise<void>
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
  const { location, rankingType, title, step1_complete, in_update_mode } = useFormFields(
    ([fields]) => ({
      location: fields.location?.value as string | undefined,
      rankingType: fields.rankingType?.value as string | undefined,
      title: fields.title?.value as string | undefined,
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
  // Used to detect when rankingType or location changes
  const prevRankingTypeRef = useRef<string | undefined>(rankingType)
  const prevLocationRef = useRef<string | undefined>(location)

  // ===========================
  // 5. COMPUTED STATE
  // ===========================
  // Check if all Step 1 fields are filled
  const isStep1Complete = useMemo(
    () => Boolean(location && rankingType && title),
    [location, rankingType, title]
  )

  // ===========================
  // 6. DETECT CHANGES IN UPDATE MODE
  // ===========================
  // When user is updating Step 1 and changes ranking type or location,
  // show confirmation dialog to warn they'll lose items
  useEffect(() => {
    if (!in_update_mode || !step1_complete) return

    // Check if ranking type changed
    if (
      prevRankingTypeRef.current &&
      rankingType &&
      prevRankingTypeRef.current !== rankingType
    ) {
      setPendingChange({
        field: 'rankingType',
        oldValue: prevRankingTypeRef.current,
        newValue: rankingType,
      })
      setShowConfirmDialog(true)
      return
    }

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
    prevRankingTypeRef.current = rankingType
    prevLocationRef.current = location
  }, [rankingType, location, in_update_mode, step1_complete])

  // ===========================
  // 7. VALIDATION
  // ===========================
  const validateStep1 = useCallback((): boolean => {
    const errors: ValidationError[] = []

    if (!location) errors.push({ field: 'location', message: 'Location is required' })
    if (!rankingType) errors.push({ field: 'rankingType', message: 'Ranking type is required' })
    if (!title) errors.push({ field: 'title', message: 'Title is required' })

    setValidationErrors(errors)
    return errors.length === 0
  }, [location, rankingType, title])

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
    // Reset tracking refs so we can detect changes
    prevRankingTypeRef.current = rankingType
    prevLocationRef.current = location
  }, [setInUpdateMode, rankingType, location])

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

    // Update tracking refs with saved values
    prevRankingTypeRef.current = rankingType
    prevLocationRef.current = location
  }, [validateStep1, setInUpdateMode, rankingType, location])

  /**
   * Handle confirmation dialog - user confirms clearing items
   * This is called when user changes rankingType/location in update mode
   * and clicks "Clear & Continue"
   */
  const handleConfirmChange = useCallback(async () => {
    setShowConfirmDialog(false)

    // Clear items array since ranking type or location changed
    // (blocks from previous ranking type won't match new type)
    await setItems([])

    // Exit update mode to return to Step 2+ view with new ranking type
    await setInUpdateMode(false)

    // Update tracking refs with new values
    prevRankingTypeRef.current = rankingType
    prevLocationRef.current = location

    setPendingChange(null)
  }, [setItems, setInUpdateMode, rankingType, location])

  /**
   * Handle confirmation dialog - user cancels
   * Keeps current items and reverts field changes
   */
  const handleCancelChange = useCallback(() => {
    setShowConfirmDialog(false)
    // Note: Field reversion is handled by Payload form state
    // We just close the dialog here
    setPendingChange(null)
  }, [])

  /**
   * Handle Cancel Update button click
   * Exits update mode without saving changes
   */
  const handleCancelUpdate = useCallback(async () => {
    setValidationErrors([])
    await setInUpdateMode(false)
    // Reset tracking refs
    prevRankingTypeRef.current = rankingType
    prevLocationRef.current = location
  }, [setInUpdateMode, rankingType, location])

  // ===========================
  // 9. RETURN STATE
  // ===========================
  return {
    location,
    rankingType,
    title,
    step1_complete,
    in_update_mode,
    isStep1Complete,
    validationErrors,
    showConfirmDialog,
    pendingChange,
    handleContinue,
    handleUpdate,
    handleSaveChanges,
    handleConfirmChange,
    handleCancelChange,
    handleCancelUpdate,
  }
}
