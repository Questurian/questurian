import { AlertCircleIcon } from './ImageUploadIcons';

type ImageUploadErrorViewProps = {
  className?: string;
  message: string;
  canRetryUpload: boolean;
  canBackToCrop: boolean;
  onRetryUpload: () => Promise<void>;
  onBackToCrop: () => void;
  onStartOver: () => void;
};

export function ImageUploadErrorView({
  className = '',
  message,
  canRetryUpload,
  canBackToCrop,
  onRetryUpload,
  onBackToCrop,
  onStartOver,
}: ImageUploadErrorViewProps) {
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
          borderRadius: '0.5rem',
        }}
      >
        <span style={{ color: '#ef4444', marginTop: '2px' }}>
          <AlertCircleIcon />
        </span>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: '0.875rem', color: '#ef4444' }}>{message}</p>
          {canRetryUpload && (
            <button
              onClick={() => void onRetryUpload()}
              style={{ marginTop: '0.5rem', marginRight: '0.75rem', fontSize: '0.75rem', color: '#f36f2b', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Retry Upload
            </button>
          )}
          {canBackToCrop && (
            <button
              onClick={onBackToCrop}
              style={{ marginTop: '0.5rem', marginRight: '0.75rem', fontSize: '0.75rem', color: '#71717a', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Back to Crop
            </button>
          )}
          <button
            onClick={onStartOver}
            style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#71717a', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            Start Over
          </button>
        </div>
      </div>
    </div>
  );
}
