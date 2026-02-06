import { useCallback, useState, useRef } from 'react';
import { MultiVariantCropper } from './MultiVariantCropper';
import { uploadImage, uploadImageVariants, UploadProgress, UploadImageResponse } from '../api/imagesApi';
import { validateImageResolution, type ImageVariantType } from '../utils/imageProcessing';

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
      <div className={`bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden ${className}`}>
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
      <div className={`bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 ${className}`}>
        <div className="flex flex-col items-center gap-4">
          <LoaderIcon />
          <div className="w-full max-w-xs">
            <div className="flex justify-between text-xs text-zinc-400 mb-1">
              <span>{progress.message}</span>
              <span>{progress.progress}%</span>
            </div>
            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#f36f2b] rounded-full transition-all duration-300"
                style={{ width: `${progress.progress}%` }}
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
      <div className={`bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 ${className}`}>
        <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <span className="text-red-400 mt-0.5 flex-shrink-0">
            <AlertCircleIcon />
          </span>
          <div className="flex-1">
            <p className="text-sm text-red-400">{progress.message}</p>
            <button
              onClick={handleClear}
              className="mt-2 text-xs text-zinc-400 hover:text-zinc-300 underline"
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Drop Zone */}
      {!selectedFile && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`
            relative border-2 border-dashed rounded-xl p-8
            flex flex-col items-center justify-center gap-3
            cursor-pointer transition-all duration-200
            ${isDragging 
              ? 'border-[#f36f2b] bg-[#f36f2b]/5' 
              : 'border-zinc-700 hover:border-zinc-600 bg-zinc-900/50 hover:bg-zinc-900'
            }
          `}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleInputChange}
            className="hidden"
          />
          <div className={`
            w-14 h-14 rounded-xl flex items-center justify-center
            ${isDragging ? 'bg-[#f36f2b]/20' : 'bg-zinc-800'}
            transition-colors duration-200
          `}>
            <span className={isDragging ? 'text-[#f36f2b]' : 'text-zinc-500'}>
              <UploadIcon />
            </span>
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-zinc-300">
              {isDragging ? 'Drop image here' : 'Click or drag image here'}
            </p>
            <p className="text-xs text-zinc-500 mt-1">
              Supports JPG, PNG, WebP up to 10MB
            </p>
          </div>
        </div>
      )}

      {/* Selected File Preview */}
      {selectedFile && (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="relative aspect-video bg-zinc-950">
            {preview && (
              <img
                src={preview}
                alt="Preview"
                className="w-full h-full object-contain"
              />
            )}
          </div>

          <div className="p-4 space-y-4">
            {/* File Info */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400">
                <ImageIcon />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-300 truncate">
                  {selectedFile.name}
                </p>
                <p className="text-xs text-zinc-500">
                  {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              <button
                onClick={handleClear}
                className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-400 hover:text-white transition-colors"
              >
                <XIcon />
              </button>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-2">
              <button
                onClick={handleStartCropping}
                disabled={!altText.trim()}
                className="w-full px-4 py-2.5 bg-[#f36f2b] hover:bg-[#e56320] disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <CropIcon />
                Adjust Crops & Upload
              </button>
              
              <div className="flex gap-2">
                <button
                  onClick={onCancel}
                  className="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSimpleUpload}
                  disabled={!altText.trim()}
                  className="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-300 text-sm font-medium rounded-lg transition-colors"
                >
                  Quick Upload
                </button>
              </div>
            </div>
            
            <p className="text-xs text-zinc-500 text-center">
              "Adjust Crops" lets you customize each variant. "Quick Upload" uses automatic cropping.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
