'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

interface Step1WorkflowState {
  location: string | undefined
  title: string | undefined
  step1_complete: boolean | undefined
  in_update_mode: boolean | undefined
  isStep1Complete: boolean
  validationErrors: ValidationError[]
  showConfirmDialog: boolean
  pendingChange: PendingChange | null
  handleContinue: () => Promise<void>
  handleUpdate: () => Promise<void>
  handleSaveChanges: () => Promise<void>
  handleConfirmChange: () => Promise<void>
  handleCancelChange: () => void
  handleCancelUpdate: () => Promise<void>
}

export const useStep1Workflow = (): Step1WorkflowState => {
  const { location, title, step1_complete, in_update_mode } = useFormFields(
    ([fields]) => ({
      location: fields.location?.value as string | undefined,
      title: fields.title?.value as string | undefined,
      step1_complete: fields.step1_complete?.value as boolean | undefined,
      in_update_mode: fields.in_update_mode?.value as boolean | undefined,
    }),
  )

  const { setValue: setStep1Complete } = useField<boolean>({ path: 'step1_complete' })
  const { setValue: setInUpdateMode } = useField<boolean>({ path: 'in_update_mode' })
  const { setValue: setItems } = useField<any[]>({ path: 'items' })

  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([])
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(null)

  const prevLocationRef = useRef<string | undefined>(location)

  const isStep1Complete = useMemo(() => {
    return Boolean(title && location)
  }, [title, location])

  useEffect(() => {
    if (!in_update_mode || !step1_complete) return

    if (prevLocationRef.current && location && prevLocationRef.current !== location) {
      setPendingChange({
        field: 'location',
        oldValue: prevLocationRef.current,
        newValue: location,
      })
      setShowConfirmDialog(true)
      return
    }

    prevLocationRef.current = location
  }, [location, in_update_mode, step1_complete])

  const validateStep1 = useCallback((): boolean => {
    const errors: ValidationError[] = []

    if (!location) errors.push({ field: 'location', message: 'Location is required' })
    if (!title) errors.push({ field: 'title', message: 'Title is required' })

    setValidationErrors(errors)
    return errors.length === 0
  }, [location, title])

  const handleContinue = useCallback(async () => {
    if (!validateStep1()) return
    await setStep1Complete(true)
  }, [validateStep1, setStep1Complete])

  const handleUpdate = useCallback(async () => {
    setValidationErrors([])
    await setInUpdateMode(true)
    prevLocationRef.current = location
  }, [setInUpdateMode, location])

  const handleSaveChanges = useCallback(async () => {
    if (!validateStep1()) return

    await setInUpdateMode(false)
    prevLocationRef.current = location
  }, [validateStep1, setInUpdateMode, location])

  const handleConfirmChange = useCallback(async () => {
    setShowConfirmDialog(false)
    await setItems([])
    await setInUpdateMode(false)

    prevLocationRef.current = location
    setPendingChange(null)
  }, [setItems, setInUpdateMode, location])

  const handleCancelChange = useCallback(() => {
    setShowConfirmDialog(false)
    setPendingChange(null)
  }, [])

  const handleCancelUpdate = useCallback(async () => {
    setValidationErrors([])
    await setInUpdateMode(false)
    prevLocationRef.current = location
  }, [setInUpdateMode, location])

  return {
    location,
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
