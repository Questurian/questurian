import type { ChangeEvent, DragEvent, RefObject } from 'react';
import { UploadIcon } from './ImageUploadIcons';

type ImageUploadSelectViewProps = {
  className?: string;
  isDragging: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onDrop: (event: DragEvent) => void;
  onDragOver: (event: DragEvent) => void;
  onDragLeave: (event: DragEvent) => void;
  onInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onOpenPicker: () => void;
};

export function ImageUploadSelectView({
  className = '',
  isDragging,
  fileInputRef,
  onDrop,
  onDragOver,
  onDragLeave,
  onInputChange,
  onOpenPicker,
}: ImageUploadSelectViewProps) {
  return (
    <div className={`stage-article-image-upload ${className}`}>
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={onOpenPicker}
        className={`stage-article-drop-zone ${isDragging ? 'dragging' : ''}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={onInputChange}
          style={{ display: 'none' }}
        />
        <div className="icon-container">
          <UploadIcon />
        </div>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '0.875rem', fontWeight: 500, color: '#d4d4d8' }}>
            {isDragging ? 'Drop image here' : 'Click or drag image here'}
          </p>
          <p style={{ fontSize: '0.75rem', color: '#71717a', marginTop: '0.25rem' }}>
            Supports JPG, PNG, WebP up to 10MB
          </p>
        </div>
      </div>
    </div>
  );
}
