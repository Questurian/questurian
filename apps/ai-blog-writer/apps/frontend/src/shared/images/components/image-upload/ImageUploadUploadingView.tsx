import type { UploadProgress } from '../../api/imagesApi';
import { LoaderIcon } from './ImageUploadIcons';

type ImageUploadUploadingViewProps = {
  className?: string;
  progress: UploadProgress;
};

export function ImageUploadUploadingView({ className = '', progress }: ImageUploadUploadingViewProps) {
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
                width: `${progress.progress}%`,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
