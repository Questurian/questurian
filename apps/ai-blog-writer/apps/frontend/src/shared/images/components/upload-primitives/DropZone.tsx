import React from 'react'
import type { ChangeEvent, DragEvent, RefObject } from 'react'

type DropZoneProps = {
  isDragging: boolean
  fileInputRef: RefObject<HTMLInputElement | null>
  accept?: string
  onDrop: (event: DragEvent) => void
  onDragOver: (event: DragEvent) => void
  onDragLeave: (event: DragEvent) => void
  onInputChange: (event: ChangeEvent<HTMLInputElement>) => void
  onOpenPicker: () => void
}

export function DropZone({
  isDragging,
  fileInputRef,
  accept = 'image/jpeg,image/png,image/webp',
  onDrop,
  onDragOver,
  onDragLeave,
  onInputChange,
  onOpenPicker,
}: DropZoneProps) {
  return (
    <div
      className={`iu-drop-zone${isDragging ? ' iu-drop-zone--dragging' : ''}`}
      onClick={onOpenPicker}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpenPicker()}
    >
      <input
        ref={fileInputRef as React.RefObject<HTMLInputElement>}
        type="file"
        accept={accept}
        className="iu-file-input"
        onChange={onInputChange}
      />
      <svg className="iu-drop-zone__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
      <p className="iu-drop-zone__title">
        {isDragging ? 'Drop image here' : 'Click or drag image here'}
      </p>
      <p className="iu-drop-zone__hint">JPEG, PNG, WebP — max 10 MB</p>
    </div>
  )
}
