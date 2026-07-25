import { useCallback, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, RefObject } from 'react'
import type { UploadProgress } from '../api/imagesApi'
import { readFileAsDataUrl, requestGeneratedAltText, uploadPreparedVariants } from '../services/image-upload-flow.service'
import type { ImageUploadProps, UploadStage, VariantUploadFile } from '../types'
import { validateImageFile } from '../validators/image-upload.validators'

export type UseImageUploadFlowResult = {
  stage: UploadStage
  isDragging: boolean
  selectedFile: File | null
  preview: string | null
  altText: string
  photographerCredit: string
  isGeneratingAlt: boolean
  progress: UploadProgress
  preparedVariantFiles: VariantUploadFile[] | null
  fileInputRef: RefObject<HTMLInputElement | null>
  canContinueToCrop: boolean
  setStage: (stage: UploadStage) => void
  setProgress: (progress: UploadProgress) => void
  setAltText: (value: string) => void
  setPhotographerCredit: (value: string) => void
  handleDrop: (event: DragEvent) => void
  handleDragOver: (event: DragEvent) => void
  handleDragLeave: (event: DragEvent) => void
  handleInputChange: (event: ChangeEvent<HTMLInputElement>) => void
  handleClear: () => void
  handleContinueToCrop: () => void
  handleCropConfirm: (variantFiles: VariantUploadFile[]) => Promise<void>
  handleRegenerateAltText: () => Promise<void>
  retryUploadPrepared: () => Promise<void>
  openFilePicker: () => void
}

export function useImageUploadFlow({
  externalRef,
  locationRef,
  token,
  initialAltText = '',
  initialPhotographerCredit = '',
  onComplete,
  onCancel,
}: ImageUploadProps): UseImageUploadFlowResult {
  const [stage, setStage] = useState<UploadStage>('select')
  const [isDragging, setIsDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [altText, setAltText] = useState(initialAltText)
  const [photographerCredit, setPhotographerCredit] = useState(initialPhotographerCredit)
  const [isGeneratingAlt, setIsGeneratingAlt] = useState(false)
  const [progress, setProgress] = useState<UploadProgress>({ status: 'idle', progress: 0, message: '' })
  const [preparedVariantFiles, setPreparedVariantFiles] = useState<VariantUploadFile[] | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const canContinueToCrop = Boolean(
    selectedFile && altText.trim() && photographerCredit.trim() && !isGeneratingAlt
  )

  const generateAltText = useCallback(async (file: File) => {
    setIsGeneratingAlt(true)
    try {
      const generated = await requestGeneratedAltText(file)
      setAltText(generated)
    } catch {
      // leave field empty so user can type manually
    } finally {
      setIsGeneratingAlt(false)
    }
  }, [])

  const handleFileSelect = useCallback(async (file: File) => {
    const error = validateImageFile(file)
    if (error) {
      setProgress({ status: 'error', progress: 0, message: error })
      return
    }

    setSelectedFile(file)
    setProgress({ status: 'idle', progress: 0, message: '' })
    setStage('metadata')

    try {
      const dataUrl = await readFileAsDataUrl(file)
      setPreview(dataUrl)
    } catch {
      setPreview(null)
    }

    await generateAltText(file)
  }, [generateAltText])

  const uploadPrepared = useCallback(async (variantFiles: VariantUploadFile[]) => {
    setStage('uploading')
    try {
      const result = await uploadPreparedVariants({
        variantFiles,
        externalRef,
        altText,
        locationRef,
        token,
        photographerCredit,
        onProgress: setProgress,
      })
      onComplete(result)
    } catch (error) {
      setProgress({
        status: 'error',
        progress: 0,
        message: error instanceof Error ? error.message : 'Upload failed',
      })
      setStage(selectedFile ? 'metadata' : 'select')
    }
  }, [altText, externalRef, locationRef, onComplete, photographerCredit, selectedFile, token])

  const handleDrop = useCallback((event: DragEvent) => {
    event.preventDefault()
    setIsDragging(false)
    const file = event.dataTransfer.files[0]
    if (file) void handleFileSelect(file)
  }, [handleFileSelect])

  const handleDragOver = useCallback((event: DragEvent) => {
    event.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((event: DragEvent) => {
    event.preventDefault()
    setIsDragging(false)
  }, [])

  const handleInputChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) void handleFileSelect(file)
  }, [handleFileSelect])

  const handleClear = useCallback(() => {
    setSelectedFile(null)
    setPreview(null)
    setPreparedVariantFiles(null)
    setAltText(initialAltText)
    setPhotographerCredit(initialPhotographerCredit)
    setStage('select')
    setProgress({ status: 'idle', progress: 0, message: '' })
    if (fileInputRef.current) fileInputRef.current.value = ''
    onCancel?.()
  }, [initialAltText, initialPhotographerCredit, onCancel])

  const handleContinueToCrop = useCallback(() => {
    if (!canContinueToCrop) return
    setStage('crop')
  }, [canContinueToCrop])

  const handleCropConfirm = useCallback(async (variantFiles: VariantUploadFile[]) => {
    setPreparedVariantFiles(variantFiles)
    await uploadPrepared(variantFiles)
  }, [uploadPrepared])

  const handleRegenerateAltText = useCallback(async () => {
    if (!selectedFile) return
    await generateAltText(selectedFile)
  }, [generateAltText, selectedFile])

  const retryUploadPrepared = useCallback(async () => {
    if (!preparedVariantFiles) return
    await uploadPrepared(preparedVariantFiles)
  }, [preparedVariantFiles, uploadPrepared])

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  return {
    stage,
    isDragging,
    selectedFile,
    preview,
    altText,
    photographerCredit,
    isGeneratingAlt,
    progress,
    preparedVariantFiles,
    fileInputRef,
    canContinueToCrop,
    setStage,
    setProgress,
    setAltText,
    setPhotographerCredit,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    handleInputChange,
    handleClear,
    handleContinueToCrop,
    handleCropConfirm,
    handleRegenerateAltText,
    retryUploadPrepared,
    openFilePicker,
  }
}
