import { MultiVariantCropper } from './MultiVariantCropper';
import { ImageUploadAltTextView } from './image-upload/ImageUploadAltTextView';
import { ImageUploadErrorView } from './image-upload/ImageUploadErrorView';
import { ImageUploadSelectView } from './image-upload/ImageUploadSelectView';
import { ImageUploadUploadingView } from './image-upload/ImageUploadUploadingView';
import { useImageUploadFlow } from '../hooks/useImageUploadFlow';
import type { ImageUploadProps } from '../types';

export function ImageUpload(props: ImageUploadProps) {
  const {
    mode,
    isDragging,
    selectedFile,
    preview,
    isGeneratingAlt,
    progress,
    preparedVariantFiles,
    fileInputRef,
    hasPhotographerCredit,
    setMode,
    setProgress,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    handleInputChange,
    handleClear,
    handleCropConfirm,
    handleStartCropping,
    handleRegenerateAltText,
    retryUploadPrepared,
    openFilePicker,
  } = useImageUploadFlow(props);

  if (mode === 'crop' && selectedFile) {
    return (
      <div className={props.className || ''}>
        <MultiVariantCropper
          file={selectedFile}
          fileNamePrefix={props.fileNamePrefix}
          onConfirm={handleCropConfirm}
          onCancel={() => setMode('select')}
        />
      </div>
    );
  }

  if (mode === 'uploading') {
    return <ImageUploadUploadingView className={props.className} progress={progress} />;
  }

  if (progress.status === 'error') {
    return (
      <ImageUploadErrorView
        className={props.className}
        message={progress.message}
        canRetryUpload={Boolean(preparedVariantFiles)}
        canBackToCrop={Boolean(selectedFile)}
        onRetryUpload={retryUploadPrepared}
        onBackToCrop={() => {
          setProgress({ status: 'idle', progress: 0, message: '' });
          setMode('crop');
        }}
        onStartOver={handleClear}
      />
    );
  }

  if (mode === 'alttext' && selectedFile) {
    return (
      <ImageUploadAltTextView
        className={props.className}
        preview={preview}
        selectedFile={selectedFile}
        altText={props.altText}
        photographerCredit={props.photographerCredit || ''}
        isGeneratingAlt={isGeneratingAlt}
        hasPhotographerCredit={hasPhotographerCredit}
        onClear={handleClear}
        onAltTextChange={props.onAltTextGenerated}
        onPhotographerCreditChange={props.onPhotographerCreditChange}
        onRegenerateAltText={handleRegenerateAltText}
        onContinueToCrop={handleStartCropping}
        onCancel={props.onCancel}
      />
    );
  }

  return (
    <ImageUploadSelectView
      className={props.className}
      isDragging={isDragging}
      fileInputRef={fileInputRef}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onInputChange={handleInputChange}
      onOpenPicker={openFilePicker}
    />
  );
}
