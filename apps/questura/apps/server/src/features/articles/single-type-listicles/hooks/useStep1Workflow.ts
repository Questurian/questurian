'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useField, useFormFields } from '@payloadcms/ui'

interface ValidationError {
  field: string
  message: string
}

interface PendingChange {
  field: 'listicleType' | 'location'
  newValue: string
  oldValue: string
}

interface Step1WorkflowState {
  location: string | undefined
  listicleType: string | undefined
  targetItemCount: number | undefined
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
  const { location, listicleType, targetItemCount, title, step1_complete, in_update_mode } =
    useFormFields(([fields]) => ({
      location: fields.location?.value as string | undefined,
      listicleType: fields.listicleType?.value as string | undefined,
      targetItemCount: fields.targetItemCount?.value as number | undefined,
      title: fields.title?.value as string | undefined,
      step1_complete: fields.step1_complete?.value as boolean | undefined,
      in_update_mode: fields.in_update_mode?.value as boolean | undefined,
    }))

  const { setValue: setStep1Complete } = useField<boolean>({ path: 'step1_complete' })
  const { setValue: setInUpdateMode } = useField<boolean>({ path: 'in_update_mode' })
  const { setValue: setItems } = useField<any[]>({ path: 'items' })

  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([])
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(null)

  const prevListicleTypeRef = useRef<string | undefined>(listicleType)
  const prevLocationRef = useRef<string | undefined>(location)

  const isStep1Complete = useMemo(
    () =>
      Boolean(
        location &&
          listicleType &&
          title &&
          typeof targetItemCount === 'number' &&
          targetItemCount >= 1 &&
          targetItemCount <= 50,
      ),
    [location, listicleType, targetItemCount, title],
  )

  useEffect(() => {
    if (!in_update_mode || !step1_complete) return

    if (
      prevListicleTypeRef.current &&
      listicleType &&
      prevListicleTypeRef.current !== listicleType
    ) {
      setPendingChange({
        field: 'listicleType',
        oldValue: prevListicleTypeRef.current,
        newValue: listicleType,
      })
      setShowConfirmDialog(true)
      return
    }

    if (prevLocationRef.current && location && prevLocationRef.current !== location) {
      setPendingChange({
        field: 'location',
        oldValue: prevLocationRef.current,
        newValue: location,
      })
      setShowConfirmDialog(true)
      return
    }

    prevListicleTypeRef.current = listicleType
    prevLocationRef.current = location
  }, [listicleType, location, in_update_mode, step1_complete])

  const validateStep1 = useCallback((): boolean => {
    const errors: ValidationError[] = []

    if (!location) errors.push({ field: 'location', message: 'Location is required' })
    if (!listicleType) {
      errors.push({ field: 'listicleType', message: 'Listicle data type is required' })
    }
    if (!title) errors.push({ field: 'title', message: 'Title is required' })

    if (typeof targetItemCount !== 'number' || Number.isNaN(targetItemCount)) {
      errors.push({ field: 'targetItemCount', message: 'Target list size is required' })
    } else if (targetItemCount < 1 || targetItemCount > 50) {
      errors.push({ field: 'targetItemCount', message: 'Target list size must be between 1 and 50' })
    }

    setValidationErrors(errors)
    return errors.length === 0
  }, [location, listicleType, targetItemCount, title])

  const handleContinue = useCallback(async () => {
    if (!validateStep1()) return
    await setStep1Complete(true)
  }, [validateStep1, setStep1Complete])

  const handleUpdate = useCallback(async () => {
    setValidationErrors([])
    await setInUpdateMode(true)
    prevListicleTypeRef.current = listicleType
    prevLocationRef.current = location
  }, [setInUpdateMode, listicleType, location])

  const handleSaveChanges = useCallback(async () => {
    if (!validateStep1()) return

    await setInUpdateMode(false)
    prevListicleTypeRef.current = listicleType
    prevLocationRef.current = location
  }, [validateStep1, setInUpdateMode, listicleType, location])

  const handleConfirmChange = useCallback(async () => {
    setShowConfirmDialog(false)
    await setItems([])
    await setInUpdateMode(false)

    prevListicleTypeRef.current = listicleType
    prevLocationRef.current = location
    setPendingChange(null)
  }, [setItems, setInUpdateMode, listicleType, location])

  const handleCancelChange = useCallback(() => {
    setShowConfirmDialog(false)
    setPendingChange(null)
  }, [])

  const handleCancelUpdate = useCallback(async () => {
    setValidationErrors([])
    await setInUpdateMode(false)
    prevListicleTypeRef.current = listicleType
    prevLocationRef.current = location
  }, [setInUpdateMode, listicleType, location])

  return {
    location,
    listicleType,
    targetItemCount,
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
