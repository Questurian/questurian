import { useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'

type UseCsvDropzoneParams = {
  onFileSelected: (file: File | null) => void
}

export function useCsvDropzone({ onFileSelected }: UseCsvDropzoneParams) {
  const [isDragOver, setIsDragOver] = useState(false)

  const handleDragOver = (event: DragEvent) => {
    event.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (event: DragEvent) => {
    event.preventDefault()
    setIsDragOver(false)
  }

  const handleDrop = (event: DragEvent) => {
    event.preventDefault()
    setIsDragOver(false)

    const files = Array.from(event.dataTransfer.files)
    const csvFile = files.find((file) => file.type === 'text/csv' || file.name.toLowerCase().endsWith('.csv'))

    if (csvFile) {
      onFileSelected(csvFile)
    }
  }

  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      onFileSelected(file)
    }
  }

  return {
    isDragOver,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleFileSelect,
  }
}
