import { useState, useCallback, useEffect } from 'react';
import Cropper, { type Point, type Area } from 'react-easy-crop';
import {
  VARIANT_SPECS,
  VARIANT_SEQUENCE,
  initializeCropStates,
  createMultiVariantImages,
  loadImage,
  type ImageVariantType,
  type CropStates,
} from '../utils/imageProcessing';

interface MultiVariantCropperProps {
  file: File;
  fileNamePrefix?: string;
  onConfirm: (variantFiles: { type: ImageVariantType; file: File }[]) => void;
  onCancel: () => void;
}

// Inline SVG icons
const CheckIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

const ChevronLeftIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
);

const ChevronRightIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6"/>
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

export function MultiVariantCropper({
  file,
  fileNamePrefix,
  onConfirm,
  onCancel,
}: MultiVariantCropperProps) {
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [currentVariantIndex, setCurrentVariantIndex] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [cropStates, setCropStates] = useState<CropStates>(initializeCropStates());
  const [errorMsg, setErrorMsg] = useState<string>('');

  const currentVariantType = VARIANT_SEQUENCE[currentVariantIndex];
  const currentState = cropStates[currentVariantType];
  const currentSpec = VARIANT_SPECS[currentVariantType];
  const formatVariantLabel = (variantType: ImageVariantType) =>
    variantType
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');

  // Create preview URL and load image dimensions when file changes
  useEffect(() => {
    let cancelled = false;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setImageDimensions(null);
    setCropStates(initializeCropStates());
    setCurrentVariantIndex(0);
    setErrorMsg('');

    const loadAndInit = async () => {
      const img = await loadImage(url);
      if (cancelled) return;
      const dimensions = { width: img.naturalWidth, height: img.naturalHeight };

      setImageDimensions(dimensions);
      setCropStates(initializeCropStates(dimensions.width, dimensions.height));
    };

    loadAndInit().catch((error) => {
      if (!cancelled) {
        setErrorMsg(error instanceof Error ? error.message : 'Failed to load image');
      }
    });

    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  const onCropChange = useCallback((crop: Point) => {
    setCropStates(prev => ({
      ...prev,
      [currentVariantType]: {
        ...prev[currentVariantType],
        crop,
        croppedAreaPixels: null,
        completed: false,
      }
    }));
  }, [currentVariantType]);

  const onZoomChange = useCallback((zoom: number) => {
    setCropStates(prev => ({
      ...prev,
      [currentVariantType]: {
        ...prev[currentVariantType],
        zoom,
        croppedAreaPixels: null,
        completed: false,
      }
    }));
  }, [currentVariantType]);

  // Track the draft crop area separately from the confirmed upload crop.
  const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setCropStates(prev => ({
      ...prev,
      [currentVariantType]: { ...prev[currentVariantType], draftAreaPixels: croppedAreaPixels }
    }));
  }, [currentVariantType]);

  const handlePrevious = () => {
    if (currentVariantIndex > 0) {
      setCurrentVariantIndex(currentVariantIndex - 1);
    }
  };

  const handleNext = () => {
    if (currentVariantIndex < VARIANT_SEQUENCE.length - 1) {
      setCurrentVariantIndex(currentVariantIndex + 1);
    }
  };

  const jumpToVariant = (index: number) => {
    setCurrentVariantIndex(index);
  };

  const handleSaveCurrentCrop = () => {
    setErrorMsg('');
    const draftCrop = cropStates[currentVariantType].draftAreaPixels;
    if (!draftCrop || draftCrop.width <= 0 || draftCrop.height <= 0) {
      setErrorMsg(`Crop area is not ready for ${formatVariantLabel(currentVariantType)}.`);
      return false;
    }

    setCropStates(prev => ({
      ...prev,
      [currentVariantType]: {
        ...prev[currentVariantType],
        croppedAreaPixels: draftCrop,
        completed: true,
      }
    }));
    return true;
  };

  const handleSaveAndNext = () => {
    const saved = handleSaveCurrentCrop();
    if (saved && currentVariantIndex < VARIANT_SEQUENCE.length - 1) {
      setCurrentVariantIndex(currentVariantIndex + 1);
    }
  };

  const handleConfirmAll = async () => {
    setErrorMsg('');
    
    // Check each variant
    const missingCrops = VARIANT_SEQUENCE.filter(type => !cropStates[type].completed || !cropStates[type].croppedAreaPixels);
    if (missingCrops.length > 0) {
      setErrorMsg(`Missing crops for: ${missingCrops.join(', ')}`);
      return;
    }

    setIsProcessing(true);
    setErrorMsg('Creating image files...');

    try {
      const variantFiles = await createMultiVariantImages(
        previewUrl,
        cropStates,
        file.name,
        fileNamePrefix
      );
      onConfirm(variantFiles);
    } catch (error) {
      console.error('Error processing variants:', error);
      const msg = error instanceof Error ? error.message : 'Unknown error';
      setErrorMsg(`Error: ${msg}`);
      alert('Failed to process image variants: ' + msg);
      setIsProcessing(false);
    }
  };

  const completedCount = VARIANT_SEQUENCE.filter(type => {
    const state = cropStates[type];
    return state.completed && state.croppedAreaPixels !== null && state.croppedAreaPixels.width > 0;
  }).length;
  const totalVariants = VARIANT_SEQUENCE.length;
  const allCropsSaved = completedCount === totalVariants;
  const currentCropSaved = currentState.completed && currentState.croppedAreaPixels !== null;

  return (
    <div className="stage-article-cropper-container">
      {/* Header */}
      <div style={{ 
        padding: '1rem 1.25rem', 
        borderBottom: '1px solid #27272a',
        flexShrink: 0
      }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#f4f4f5', margin: 0 }}>
          Crop: {formatVariantLabel(currentVariantType)}
        </h3>
        <p style={{ fontSize: '0.875rem', color: '#71717a', margin: '0.25rem 0 0 0' }}>
          Step {currentVariantIndex + 1} of {totalVariants} • Target: {currentSpec.width}×{currentSpec.height}px ({currentSpec.label})
          {imageDimensions && ` • Source: ${imageDimensions.width}×${imageDimensions.height}`}
        </p>
      </div>

      {/* Cropper area - Fixed height */}
      <div className="stage-article-cropper-area" style={{ height: '280px' }}>
        {previewUrl && (
          <Cropper
            image={previewUrl}
            crop={currentState.crop}
            zoom={currentState.zoom}
            aspect={currentSpec.ratio}
            onCropChange={onCropChange}
            onZoomChange={onZoomChange}
            onCropComplete={onCropComplete}
            restrictPosition={true}
            cropShape="rect"
            showGrid={true}
            style={{
              containerStyle: { background: '#000', height: '100%' },
              cropAreaStyle: { border: '2px solid #f36f2b' }
            }}
          />
        )}
      </div>

      {/* Controls */}
      <div className="stage-article-cropper-controls" style={{ flexShrink: 0 }}>
        {/* Variant progress badges */}
        <div className="stage-article-cropper-variants">
          {VARIANT_SEQUENCE.map((type, idx) => {
            const isActive = idx === currentVariantIndex;
            const isCompleted = cropStates[type].completed && cropStates[type].croppedAreaPixels !== null && cropStates[type].croppedAreaPixels!.width > 0;

            return (
              <button
                key={type}
                onClick={() => jumpToVariant(idx)}
                disabled={isProcessing}
                className={`stage-article-cropper-variant-btn ${isActive ? 'active' : isCompleted ? 'completed' : 'pending'}`}
              >
                {isCompleted && <CheckIcon />}
                <span>{formatVariantLabel(type)}</span>
                <span style={{ fontSize: '10px', opacity: 0.7 }}>({VARIANT_SPECS[type].label})</span>
              </button>
            );
          })}
        </div>

        {/* Zoom info */}
        <div style={{ fontSize: '0.75rem', color: '#71717a', textAlign: 'center', marginBottom: '0.75rem' }}>
          Zoom: {Math.round(currentState.zoom * 100)}% • Scroll or pinch to zoom • Drag to move
        </div>

        {/* Error/Status message */}
        {errorMsg && (
          <div style={{ fontSize: '0.75rem', color: '#f36f2b', textAlign: 'center', marginBottom: '0.75rem' }}>
            {errorMsg}
          </div>
        )}

        {/* Footer buttons */}
        <div className="stage-article-cropper-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={handlePrevious}
              disabled={currentVariantIndex === 0 || isProcessing}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                padding: '0.5rem 0.75rem',
                background: '#3f3f46',
                color: '#d4d4d8',
                border: 'none',
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
                cursor: currentVariantIndex === 0 || isProcessing ? 'not-allowed' : 'pointer',
                opacity: currentVariantIndex === 0 || isProcessing ? 0.5 : 1
              }}
            >
              <ChevronLeftIcon />
              Previous
            </button>
            <button
              type="button"
              onClick={handleNext}
              disabled={currentVariantIndex === VARIANT_SEQUENCE.length - 1 || isProcessing}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                padding: '0.5rem 0.75rem',
                background: '#3f3f46',
                color: '#d4d4d8',
                border: 'none',
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
                cursor: currentVariantIndex === VARIANT_SEQUENCE.length - 1 || isProcessing ? 'not-allowed' : 'pointer',
                opacity: currentVariantIndex === VARIANT_SEQUENCE.length - 1 || isProcessing ? 0.5 : 1
              }}
            >
              Next
              <ChevronRightIcon />
            </button>
          </div>

          <button
            type="button"
            onClick={handleSaveAndNext}
            disabled={isProcessing || !currentState.draftAreaPixels}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 0.75rem',
              background: currentCropSaved ? '#2f6f48' : '#f36f2b',
              color: '#fff',
              border: 'none',
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: isProcessing || !currentState.draftAreaPixels ? 'not-allowed' : 'pointer',
              opacity: isProcessing || !currentState.draftAreaPixels ? 0.5 : 1
            }}
          >
            <CheckIcon />
            {currentVariantIndex === VARIANT_SEQUENCE.length - 1 ? 'Save crop' : 'Save & Next'}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={onCancel}
              disabled={isProcessing}
              style={{
                padding: '0.5rem 1rem',
                background: '#3f3f46',
                color: '#d4d4d8',
                border: 'none',
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: 500,
                cursor: isProcessing ? 'not-allowed' : 'pointer',
                opacity: isProcessing ? 0.5 : 1
              }}
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleConfirmAll}
              disabled={isProcessing || !allCropsSaved}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 1rem',
                background: allCropsSaved ? '#f36f2b' : '#3f3f46',
                color: allCropsSaved ? '#fff' : '#71717a',
                border: 'none',
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: 500,
                cursor: isProcessing || !allCropsSaved ? 'not-allowed' : 'pointer',
                opacity: isProcessing ? 0.5 : 1
              }}
            >
              {isProcessing ? (
                <>
                  <LoaderIcon />
                  Processing...
                </>
              ) : (
                <>
                  <CheckIcon />
                  {allCropsSaved
                    ? 'Generate crops'
                    : `Saved ${completedCount}/${totalVariants}`}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
