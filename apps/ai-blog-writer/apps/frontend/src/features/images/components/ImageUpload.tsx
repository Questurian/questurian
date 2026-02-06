import { useCallback, useState, useRef } from 'react';
import { MultiVariantCropper } from './MultiVariantCropper';
import { uploadImage, uploadImageVariants, UploadProgress, UploadImageResponse } from '../api/imagesApi';
import { type ImageVariantType } from '../utils/imageProcessing';

// Inline SVG icons
const UploadIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="17 8 12 3 7 8"/>
    <line x1="12" y1="3" x2="12" y2="15"/>
  </svg>
);

const XIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

const ImageIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
    <circle cx="8.5" cy="8.5" r="1.5"/>
    <polyline points="21 15 16 10 5 21"/>
  </svg>
);

const LoaderIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
    <line x1="12" y1="2" x2="12" y2="6"/>
    <line x1="12" y1="18" x2="12" y2="22"/>
    <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/>
    <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/>
    <line x1="2" y1="12" x2="6" y2="12"/>
    <line x1="18" y1="12" x2="22" y2="12"/>
    <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/>
    <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/>
  </svg>
);

const CheckCircleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
    <polyline points="22 4 12 14.01 9 11.01"/>
  </svg>
);

const AlertCircleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="12"/>
    <line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
);

const CropIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6.13 1L6 16a2 2 0 0 0 2 2h15"/>
    <path d="M1 6.13L16 6a2 2 0 0 1 2 2v15"/>
  </svg>
);

interface ImageUploadProps {
  externalRef: string;
  token: string;
  altText: string;
  onUploadComplete: (result: UploadImageResponse) => void;
  onCancel?: () => void;
  className?: string;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

type UploadMode = 'select' | 'crop' | 'uploading';

export function ImageUpload({
  externalRef,
  token,
  altText,
  onUploadComplete,
  onCancel,
  className = ''
}: ImageUploadProps) {
  const [mode, setMode] = useState<UploadMode>('select');
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [progress, setProgress] = useState<UploadProgress>({
    status: 'idle',
    progress: 0,
    message: ''
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    if (!file.type.startsWith('image/')) {
      return 'Please select an image file';
    }
    if (file.size > MAX_FILE_SIZE) {
      return 'File too large (max 10MB)';
    }
    return null;
  };

  const handleFileSelect = useCallback(async (file: File) => {
    const error = validateFile(file);
    if (error) {
      setProgress({
        status: 'error',
        progress: 0,
        message: error
      });
      return;
    }

    setSelectedFile(file);
    setProgress({ status: 'idle', progress: 0, message: '' });

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  const handleClear = useCallback(() => {
    setSelectedFile(null);
    setPreview(null);
    setMode('select');
    setProgress({ status: 'idle', progress: 0, message: '' });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleSimpleUpload = useCallback(async () => {
    if (!selectedFile) return;

    setMode('uploading');

    try {
      const result = await uploadImage(
        selectedFile,
        externalRef,
        altText,
        token,
        setProgress
      );
      onUploadComplete(result);
    } catch (error) {
      setProgress({
        status: 'error',
        progress: 0,
        message: error instanceof Error ? error.message : 'Upload failed'
      });
      setMode('select');
    }
  }, [selectedFile, externalRef, altText, token, onUploadComplete]);

  const handleCropConfirm = useCallback(async (variantFiles: { type: ImageVariantType; file: File }[]) => {
    setMode('uploading');

    try {
      const result = await uploadImageVariants(
        variantFiles,
        externalRef,
        altText,
        token,
        setProgress
      );
      onUploadComplete(result);
    } catch (error) {
      setProgress({
        status: 'error',
        progress: 0,
        message: error instanceof Error ? error.message : 'Upload failed'
      });
      setMode('crop');
    }
  }, [externalRef, altText, token, onUploadComplete]);

  const handleStartCropping = () => {
    if (!selectedFile) return;
    setMode('crop');
  };

  // Render the cropper mode
  if (mode === 'crop' && selectedFile) {
    return (
      <div className={className}>
        <MultiVariantCropper
          file={selectedFile}
          altText={altText}
          onConfirm={handleCropConfirm}
          onCancel={() => setMode('select')}
        />
      </div>
    );
  }

  // Render the uploading state
  if (mode === 'uploading') {
    return (
      <div className={`stage-article-preview-container ${className}`} style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
          <LoaderIcon />
          <div style={{ width: '100%', maxWidth: '320px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#71717a', marginBottom: '0.25rem' }}>
              <span>{progress.message}</span>
              <span>{progress.progress}%</span>
            </div>
            <div style={{ height: '0.5rem', background: '#27272a', borderRadius: '9999px', overflow: 'hidden' }}>
              <div
                style={{ 
                  height: '100%', 
                  background: '#f36f2b', 
                  borderRadius: '9999px', 
                  transition: 'width 0.3s',
                  width: `${progress.progress}%` 
                }}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render error state
  if (progress.status === 'error') {
    return (
      <div className={`stage-article-preview-container ${className}`} style={{ padding: '1rem' }}>
        <div 
          style={{ 
            display: 'flex', 
            alignItems: 'flex-start', 
            gap: '0.5rem', 
            padding: '0.75rem',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            borderRadius: '0.5rem'
          }}
        >
          <span style={{ color: '#ef4444', marginTop: '2px' }}>
            <AlertCircleIcon />
          </span>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: '0.875rem', color: '#ef4444' }}>{progress.message}</p>
            <button
              onClick={handleClear}
              style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#71717a', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`stage-article-image-upload ${className}`}>
      {/* Drop Zone */}
      {!selectedFile && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`stage-article-drop-zone ${isDragging ? 'dragging' : ''}`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleInputChange}
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
      )}

      {/* Selected File Preview */}
      {selectedFile && (
        <div className="stage-article-preview-container">
          <div className="stage-article-preview-image">
            {preview && (
              <img src={preview} alt="Preview" />
            )}
          </div>

          <div className="stage-article-preview-info">
            <div className="stage-article-preview-icon">
              <ImageIcon />
            </div>
            <div className="stage-article-preview-details">
              <p className="stage-article-preview-name">{selectedFile.name}</p>
              <p className="stage-article-preview-size">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
            <button
              onClick={handleClear}
              className="stage-article-preview-clear"
            >
              <XIcon />
            </button>
          </div>

          <div className="stage-article-upload-actions">
            <button
              onClick={handleStartCropping}
              disabled={!altText.trim()}
              className="stage-article-upload-primary"
            >
              <CropIcon />
              Adjust Crops & Upload
            </button>
            
            <div className="stage-article-upload-secondary">
              <button onClick={onCancel}>
                Cancel
              </button>
              <button
                onClick={handleSimpleUpload}
                disabled={!altText.trim()}
                style={{ opacity: !altText.trim() ? 0.5 : 1, cursor: !altText.trim() ? 'not-allowed' : 'pointer' }}
              >
                Quick Upload
              </button>
            </div>
            
            <p className="stage-article-upload-hint">
              "Adjust Crops" lets you customize each variant. "Quick Upload" uses automatic cropping.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
