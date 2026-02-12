import { useCallback, useState, useRef } from 'react';
import { MultiVariantCropper } from './MultiVariantCropper';
import { uploadImageVariants, generateAltText, UploadProgress, UploadImageResponse } from '../api/imagesApi';
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
  fileNamePrefix?: string;
  locationRef: number;
  token: string;
  altText: string;
  photographerCredit?: string;
  onUploadComplete: (result: UploadImageResponse) => void;
  onAltTextGenerated?: (altText: string) => void;
  onPhotographerCreditChange?: (photographerCredit: string) => void;
  onCancel?: () => void;
  className?: string;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

type UploadMode = 'select' | 'alttext' | 'crop' | 'uploading';
type VariantUploadFile = { type: ImageVariantType; file: File };

export function ImageUpload({
  externalRef,
  fileNamePrefix,
  locationRef,
  token,
  altText,
  photographerCredit = '',
  onUploadComplete,
  onAltTextGenerated,
  onPhotographerCreditChange,
  onCancel,
  className = ''
}: ImageUploadProps) {
  const [mode, setMode] = useState<UploadMode>('select');
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isGeneratingAlt, setIsGeneratingAlt] = useState(false);
  const [progress, setProgress] = useState<UploadProgress>({
    status: 'idle',
    progress: 0,
    message: ''
  });
  const [preparedVariantFiles, setPreparedVariantFiles] = useState<VariantUploadFile[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const requestAltText = useCallback(async (file: File) => {
    if (!onAltTextGenerated) return;

    setIsGeneratingAlt(true);
    try {
      const generatedAlt = await generateAltText(file);
      onAltTextGenerated(generatedAlt);
    } catch (err) {
      console.error('Alt text generation failed:', err);
    } finally {
      setIsGeneratingAlt(false);
    }
  }, [onAltTextGenerated]);

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
    setMode('alttext');

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);

    // Auto-generate alt text
    await requestAltText(file);
  }, [requestAltText]);

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
    setPreparedVariantFiles(null);
    setMode('select');
    setProgress({ status: 'idle', progress: 0, message: '' });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const uploadPreparedVariants = useCallback(async (variantFiles: VariantUploadFile[]) => {
    setMode('uploading');

    try {
      const result = await uploadImageVariants(
        variantFiles,
        externalRef,
        altText,
        locationRef,
        token,
        photographerCredit,
        setProgress
      );
      onUploadComplete(result);
    } catch (error) {
      setProgress({
        status: 'error',
        progress: 0,
        message: error instanceof Error ? error.message : 'Upload failed'
      });
      setMode(selectedFile ? 'alttext' : 'select');
    }
  }, [externalRef, altText, locationRef, token, photographerCredit, onUploadComplete, selectedFile]);

  const handleCropConfirm = useCallback(async (variantFiles: VariantUploadFile[]) => {
    setPreparedVariantFiles(variantFiles);
    await uploadPreparedVariants(variantFiles);
  }, [uploadPreparedVariants]);

  const handleStartCropping = () => {
    if (!selectedFile) return;
    setMode('crop');
  };

  const handleRegenerateAltText = useCallback(async () => {
    if (!selectedFile) return;
    await requestAltText(selectedFile);
  }, [requestAltText, selectedFile]);

  // Render the cropper mode
  if (mode === 'crop' && selectedFile) {
    return (
      <div className={className}>
        <MultiVariantCropper
          file={selectedFile}
          fileNamePrefix={fileNamePrefix}
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
            {preparedVariantFiles && (
              <button
                onClick={() => void uploadPreparedVariants(preparedVariantFiles)}
                style={{ marginTop: '0.5rem', marginRight: '0.75rem', fontSize: '0.75rem', color: '#f36f2b', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Retry Upload
              </button>
            )}
            {selectedFile && (
              <button
                onClick={() => {
                  setProgress({ status: 'idle', progress: 0, message: '' });
                  setMode('crop');
                }}
                style={{ marginTop: '0.5rem', marginRight: '0.75rem', fontSize: '0.75rem', color: '#71717a', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Back to Crop
              </button>
            )}
            <button
              onClick={handleClear}
              style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#71717a', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Start Over
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Render alt text stage
  if (mode === 'alttext' && selectedFile) {
    return (
      <div className={`stage-article-image-upload ${className}`}>
        <div className="stage-article-preview-container">
          <div className="stage-article-preview-image">
            {preview && <img src={preview} alt="Preview" />}
          </div>

          <div className="stage-article-preview-info-compact">
            <span className="stage-article-preview-name-compact">{selectedFile.name}</span>
            <span className="stage-article-preview-size-compact">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</span>
            <button onClick={handleClear} className="stage-article-preview-clear-compact">
              <XIcon />
            </button>
          </div>

          <div className="stage-article-alttext-section">
            <label className="stage-article-alttext-label">Alt Text</label>
            {isGeneratingAlt && (
              <div className="stage-article-alttext-generating">
                <LoaderIcon />
                <span>Generating with AI...</span>
              </div>
            )}
            <input
              type="text"
              className="stage-article-alttext-input"
              value={altText}
              onChange={(e) => onAltTextGenerated?.(e.target.value)}
              placeholder={isGeneratingAlt ? 'Generating...' : 'Describe the image for accessibility'}
              disabled={isGeneratingAlt}
            />
            <label className="stage-article-alttext-label" style={{ marginTop: '0.75rem' }}>
              Photographer Credit (Optional)
            </label>
            <input
              type="text"
              className="stage-article-alttext-input"
              value={photographerCredit}
              onChange={(e) => onPhotographerCreditChange?.(e.target.value)}
              placeholder="Example: Jane Doe / Unsplash"
              disabled={isGeneratingAlt}
            />
            <div className="stage-article-upload-secondary" style={{ marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={handleRegenerateAltText}
                disabled={isGeneratingAlt || !selectedFile}
              >
                Regenerate Alt Text
              </button>
            </div>
          </div>

          <div className="stage-article-upload-actions">
            <button
              onClick={handleStartCropping}
              disabled={!altText.trim() || isGeneratingAlt}
              className="stage-article-upload-primary"
            >
              <CropIcon />
              Continue to Crop
            </button>
            <div className="stage-article-upload-secondary">
              <button onClick={onCancel}>Cancel</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render drop zone (select mode)
  return (
    <div className={`stage-article-image-upload ${className}`}>
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
    </div>
  );
}
