'use client'

/**
 * useStep1Workflow Hook
 *
 * Encapsulates the state machine logic for the multi-step article form workflow.
 *
 * Responsibilities:
 * - Manage Step 1 field validation (title, location)
 * - Track state transitions (incomplete → complete → update → confirmed)
 * - Manage lock/unlock states
 *
 * State Flow:
 * 1. Initial: step1_complete=false, in_update_mode=false
 * 2. Continue: User clicks Continue button → step1_complete=true
 * 3. Update: User clicks Update Setup → in_update_mode=true
 * 4. Save: User clicks Save Changes → in_update_mode=false
 */

import { useCallback, useMemo, useState } from 'react'
import { useField, useFormFields } from '@payloadcms/ui'

interface ValidationError {
  field: string
  message: string
}

/**
 * Configuration object returned by the hook
 */
interface Step1WorkflowState {
  // Form field values
  location: string | undefined
  title: string | undefined
  step1_complete: boolean | undefined
  in_update_mode: boolean | undefined

  // Computed state
  isStep1Complete: boolean

  // Validation
  validationErrors: ValidationError[]

  // Handlers
  handleContinue: () => Promise<void>
  handleUpdate: () => Promise<void>
  handleSaveChanges: () => Promise<void>
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
  const { location, title, step1_complete, in_update_mode } = useFormFields(
    ([fields]) => ({
      location: fields.location?.value as string | undefined,
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

  // ===========================
  // 3. MANAGE LOCAL STATE
  // ===========================
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([])

  // ===========================
  // 4. COMPUTED STATE
  // ===========================
  // Check if all Step 1 fields are filled
  const isStep1Complete = useMemo(
    () => Boolean(location && title),
    [location, title]
  )

  // ===========================
  // 5. VALIDATION
  // ===========================
  const validateStep1 = useCallback((): boolean => {
    const errors: ValidationError[] = []

    if (!location) errors.push({ field: 'location', message: 'Location is required' })
    if (!title) errors.push({ field: 'title', message: 'Title is required' })

    setValidationErrors(errors)
    return errors.length === 0
  }, [location, title])

  // ===========================
  // 6. HANDLERS
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
  }, [setInUpdateMode])

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
  }, [validateStep1, setInUpdateMode])

  /**
   * Handle Cancel Update button click
   * Exits update mode without saving changes
   */
  const handleCancelUpdate = useCallback(async () => {
    setValidationErrors([])
    await setInUpdateMode(false)
  }, [setInUpdateMode])

  // ===========================
  // 7. RETURN STATE
  // ===========================
  return {
    location,
    title,
    step1_complete,
    in_update_mode,
    isStep1Complete,
    validationErrors,
    handleContinue,
    handleUpdate,
    handleSaveChanges,
    handleCancelUpdate,
  }
}

