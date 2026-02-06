import { useState, useCallback, useEffect } from 'react';
import Cropper, { type Point, type Area } from 'react-easy-crop';
import {
  VARIANT_SPECS,
  VARIANT_SEQUENCE,
  initializeCropStates,
  createMultiVariantImages,
  type ImageVariantType,
  type CropStates,
  validateImageResolution,
} from '../utils/imageProcessing';

interface MultiVariantCropperProps {
  file: File;
  altText: string;
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

const MIN_RESOLUTION = { width: 1920, height: 1080 };

export function MultiVariantCropper({ file, altText, onConfirm, onCancel }: MultiVariantCropperProps) {
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [currentVariantIndex, setCurrentVariantIndex] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [cropStates, setCropStates] = useState<CropStates>(initializeCropStates());

  const currentVariantType = VARIANT_SEQUENCE[currentVariantIndex];
  const currentState = cropStates[currentVariantType];
  const currentSpec = VARIANT_SPECS[currentVariantType];

  // Validate and create preview URL when file changes
  useEffect(() => {
    const validateAndLoad = async () => {
      const validation = await validateImageResolution(
        file,
        MIN_RESOLUTION.width,
        MIN_RESOLUTION.height
      );

      if (!validation.valid) {
        setValidationError(validation.error || 'Image validation failed');
        return;
      }

      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      setValidationError(null);

      return () => URL.revokeObjectURL(url);
    };

    validateAndLoad();
  }, [file]);

  const onCropChange = useCallback((crop: Point) => {
    setCropStates(prev => ({
      ...prev,
      [currentVariantType]: { ...prev[currentVariantType], crop }
    }));
  }, [currentVariantType]);

  const onZoomChange = useCallback((zoom: number) => {
    setCropStates(prev => ({
      ...prev,
      [currentVariantType]: { ...prev[currentVariantType], zoom }
    }));
  }, [currentVariantType]);

  const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setCropStates(prev => ({
      ...prev,
      [currentVariantType]: { ...prev[currentVariantType], croppedAreaPixels, completed: true }
    }));
  }, [currentVariantType]);

  const handlePrevious = () => {
    if (currentVariantIndex > 0) {
      setCropStates(prev => ({
        ...prev,
        [currentVariantType]: { ...prev[currentVariantType], completed: true }
      }));
      setCurrentVariantIndex(currentVariantIndex - 1);
    }
  };

  const handleNext = () => {
    if (currentVariantIndex < VARIANT_SEQUENCE.length - 1) {
      setCropStates(prev => ({
        ...prev,
        [currentVariantType]: { ...prev[currentVariantType], completed: true }
      }));
      setCurrentVariantIndex(currentVariantIndex + 1);
    }
  };

  const jumpToVariant = (index: number) => {
    setCropStates(prev => ({
      ...prev,
      [currentVariantType]: { ...prev[currentVariantType], completed: true }
    }));
    setCurrentVariantIndex(index);
  };

  const allCropsComplete = () => {
    return VARIANT_SEQUENCE.every(type => cropStates[type].croppedAreaPixels !== null);
  };

  const handleConfirmAll = async () => {
    if (!currentState.croppedAreaPixels) {
      alert('Please adjust the crop area before confirming');
      return;
    }

    if (!allCropsComplete()) {
      alert('Please complete all 5 variant crops');
      return;
    }

    setIsProcessing(true);

    try {
      const variantFiles = await createMultiVariantImages(previewUrl, cropStates, file.name);
      onConfirm(variantFiles);
    } catch (error) {
      console.error('Error processing variants:', error);
      alert('Failed to process image variants');
    } finally {
      setIsProcessing(false);
    }
  };

  const completedCount = VARIANT_SEQUENCE.filter(type => cropStates[type].completed || cropStates[type].croppedAreaPixels !== null).length;

  if (validationError) {
    return (
      <div className="p-6 text-center">
        <div className="text-red-400 mb-4">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mx-auto">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <h3 className="text-lg font-medium text-zinc-200 mb-2">Image Resolution Too Low</h3>
        <p className="text-zinc-400 text-sm mb-4">{validationError}</p>
        <p className="text-zinc-500 text-xs mb-6">
          For best results, please use an image at least {MIN_RESOLUTION.width}×{MIN_RESOLUTION.height}px.
        </p>
        <button
          onClick={onCancel}
          className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-lg transition-colors"
        >
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800">
        <h3 className="text-lg font-semibold text-zinc-100">
          Crop: {currentVariantType.charAt(0).toUpperCase() + currentVariantType.slice(1)}
        </h3>
        <p className="text-sm text-zinc-500">
          Step {currentVariantIndex + 1} of 5 • Target: {currentSpec.width}×{currentSpec.height}px ({currentSpec.label})
        </p>
      </div>

      {/* Cropper area */}
      <div className="relative flex-1 min-h-[300px] bg-black">
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
              containerStyle: { background: '#000' },
              cropAreaStyle: { border: '2px solid #f36f2b' }
            }}
          />
        )}
      </div>

      {/* Variant progress badges */}
      <div className="px-4 py-3 border-t border-b border-zinc-800 bg-zinc-900/50">
        <div className="flex gap-2 flex-wrap justify-center">
          {VARIANT_SEQUENCE.map((type, idx) => {
            const isActive = idx === currentVariantIndex;
            const isCompleted = cropStates[type].completed || cropStates[type].croppedAreaPixels !== null;
            const spec = VARIANT_SPECS[type];

            return (
              <button
                key={type}
                onClick={() => jumpToVariant(idx)}
                disabled={isProcessing}
                className={`
                  flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors
                  ${isActive
                    ? 'bg-[#f36f2b] text-white'
                    : isCompleted
                      ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                  }
                `}
              >
                {isCompleted && <CheckIcon />}
                <span className="capitalize">{type}</span>
                <span className="text-[10px] opacity-70">({spec.label})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Zoom info */}
      <div className="px-4 py-2 text-xs text-zinc-500 text-center">
        Zoom: {Math.round(currentState.zoom * 100)}% • Scroll or pinch to zoom • Drag to move
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-zinc-800 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrevious}
            disabled={currentVariantIndex === 0 || isProcessing}
            className="flex items-center gap-1 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-300 text-sm rounded-lg transition-colors"
          >
            <ChevronLeftIcon />
            Previous
          </button>
          <button
            type="button"
            onClick={handleNext}
            disabled={currentVariantIndex === VARIANT_SEQUENCE.length - 1 || isProcessing}
            className="flex items-center gap-1 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-300 text-sm rounded-lg transition-colors"
          >
            Next
            <ChevronRightIcon />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isProcessing}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium rounded-lg transition-colors"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleConfirmAll}
            disabled={isProcessing || !allCropsComplete()}
            className={`
              flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors
              ${allCropsComplete()
                ? 'bg-[#f36f2b] hover:bg-[#e56320] text-white'
                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
              }
            `}
          >
            {isProcessing ? (
              <>
                <LoaderIcon />
                Processing...
              </>
            ) : allCropsComplete() ? (
              <>
                <CheckIcon />
                Confirm All ({completedCount}/5)
              </>
            ) : (
              `Crop All (${completedCount}/5)`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
