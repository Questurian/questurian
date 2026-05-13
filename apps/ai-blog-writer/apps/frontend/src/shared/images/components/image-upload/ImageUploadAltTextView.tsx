import { CropIcon, LoaderIcon, XIcon } from './ImageUploadIcons';

type ImageUploadAltTextViewProps = {
  className?: string;
  preview: string | null;
  selectedFile: File;
  altText: string;
  photographerCredit: string;
  isGeneratingAlt: boolean;
  hasPhotographerCredit: boolean;
  onClear: () => void;
  onAltTextChange?: (value: string) => void;
  onPhotographerCreditChange?: (value: string) => void;
  onRegenerateAltText: () => Promise<void>;
  onContinueToCrop: () => void;
  onCancel?: () => void;
};

export function ImageUploadAltTextView({
  className = '',
  preview,
  selectedFile,
  altText,
  photographerCredit,
  isGeneratingAlt,
  hasPhotographerCredit,
  onClear,
  onAltTextChange,
  onPhotographerCreditChange,
  onRegenerateAltText,
  onContinueToCrop,
  onCancel,
}: ImageUploadAltTextViewProps) {
  return (
    <div className={`stage-article-image-upload ${className}`}>
      <div className="stage-article-preview-container">
        <div className="stage-article-preview-image">{preview && <img src={preview} alt="Preview" />}</div>

        <div className="stage-article-preview-info-compact">
          <span className="stage-article-preview-name-compact">{selectedFile.name}</span>
          <span className="stage-article-preview-size-compact">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</span>
          <button onClick={onClear} className="stage-article-preview-clear-compact">
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
            onChange={(event) => onAltTextChange?.(event.target.value)}
            placeholder={isGeneratingAlt ? 'Generating...' : 'Describe the image for accessibility'}
            disabled={isGeneratingAlt}
          />
          <label className="stage-article-alttext-label" style={{ marginTop: '0.75rem' }}>
            Photographer Credit <span className="required">*</span>
          </label>
          <input
            type="text"
            className="stage-article-alttext-input"
            value={photographerCredit}
            onChange={(event) => onPhotographerCreditChange?.(event.target.value)}
            placeholder="Example: Jane Doe / Unsplash"
            disabled={isGeneratingAlt}
            required
            aria-required="true"
          />
          {!hasPhotographerCredit && !isGeneratingAlt && (
            <p style={{ marginTop: '0.35rem', fontSize: '0.75rem', color: '#ef4444' }}>
              Photographer credit is required before upload.
            </p>
          )}
          <div className="stage-article-upload-secondary" style={{ marginTop: '0.5rem' }}>
            <button type="button" onClick={() => void onRegenerateAltText()} disabled={isGeneratingAlt || !selectedFile}>
              Regenerate Alt Text
            </button>
          </div>
        </div>

        <div className="stage-article-upload-actions">
          <button
            onClick={onContinueToCrop}
            disabled={!altText.trim() || !hasPhotographerCredit || isGeneratingAlt}
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
