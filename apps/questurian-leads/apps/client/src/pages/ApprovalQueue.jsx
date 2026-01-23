import { useState } from 'react';
import { instagramPostImageUrl } from '../api';
import {
  useApprovalPending,
  useApprovalStats,
  useApproveItem,
  useRejectItem,
} from '../hooks';
import { useDialog } from '../providers/DialogProvider';


const CONTENT_TYPE_LABELS = {
  lead: 'Article',
  instagram_post: 'Instagram Post',
  reddit_post: 'Reddit Post',
  el_comercio_post: 'El Comercio Article',
  diario_correo_post: 'Diario Correo Article'
};

const LANGUAGE_NAMES = {
  'af': 'Afrikaans',
  'ar': 'Arabic',
  'bg': 'Bulgarian',
  'bn': 'Bengali',
  'ca': 'Catalan',
  'cs': 'Czech',
  'cy': 'Welsh',
  'da': 'Danish',
  'de': 'German',
  'el': 'Greek',
  'en': 'English',
  'eo': 'Esperanto',
  'es': 'Spanish',
  'et': 'Estonian',
  'fa': 'Persian',
  'fi': 'Finnish',
  'fr': 'French',
  'ga': 'Irish',
  'gu': 'Gujarati',
  'he': 'Hebrew',
  'hi': 'Hindi',
  'hr': 'Croatian',
  'hu': 'Hungarian',
  'id': 'Indonesian',
  'is': 'Icelandic',
  'it': 'Italian',
  'ja': 'Japanese',
  'kn': 'Kannada',
  'ko': 'Korean',
  'lt': 'Lithuanian',
  'lv': 'Latvian',
  'mk': 'Macedonian',
  'ml': 'Malayalam',
  'mr': 'Marathi',
  'ne': 'Nepali',
  'nl': 'Dutch',
  'no': 'Norwegian',
  'pa': 'Punjabi',
  'pl': 'Polish',
  'pt': 'Portuguese',
  'ro': 'Romanian',
  'ru': 'Russian',
  'sk': 'Slovak',
  'sl': 'Slovenian',
  'so': 'Somali',
  'sq': 'Albanian',
  'sv': 'Swedish',
  'sw': 'Swahili',
  'ta': 'Tamil',
  'te': 'Telugu',
  'th': 'Thai',
  'tl': 'Tagalog',
  'tr': 'Turkish',
  'uk': 'Ukrainian',
  'ur': 'Urdu',
  'vi': 'Vietnamese',
  'zh': 'Chinese'
};

function getLanguageName(code) {
  return LANGUAGE_NAMES[code] || code?.toUpperCase() || '';
}

export default function ApprovalQueue() {
  const [filter, setFilter] = useState('all'); // 'all' or content_type
  const [approvedBy, setApprovedBy] = useState('admin'); // Default user
  const dialog = useDialog();

  const contentType = filter === 'all' ? null : (filter === 'articles' ? 'lead,el_comercio_post,diario_correo_post' : filter);
  const {
    data: pendingData,
    isLoading: pendingLoading,
    isFetching: pendingFetching,
    error: pendingError,
  } = useApprovalPending(contentType);
  const {
    data: stats,
    isLoading: statsLoading,
    error: statsError,
  } = useApprovalStats();

  const approveMutation = useApproveItem();
  const rejectMutation = useRejectItem();

  const pendingItems = pendingData?.items || [];
  const isLoading = pendingLoading || statsLoading;
  const error = pendingError || statsError;
  const isMutating =
    approveMutation.isPending ||
    rejectMutation.isPending;


  async function handleApprove(item) {
    try {
      await approveMutation.mutateAsync({
        contentType: item.content_type,
        contentId: item.content_id,
        approvedBy,
      });
    } catch (err) {
      await dialog.alert(`Error approving: ${err.message}`);
    }
  }

  async function handleReject(item, notes = null) {
    try {
      await rejectMutation.mutateAsync({
        contentType: item.content_type,
        contentId: item.content_id,
        approvedBy,
        notes,
      });
    } catch (err) {
      await dialog.alert(`Error rejecting: ${err.message}`);
    }
  }


  return (
    <div className="page">
      <div className="page-header">
        <h1>Approval Queue</h1>
        <div className="approval-stats">
          {pendingFetching && !pendingLoading && (
            <span className="badge">Refreshing...</span>
          )}
        </div>
      </div>

      {error && <div className="error">{error.message}</div>}

      {/* Filter Tabs */}
      <div className="filters card">
        <div className="filter-tabs">
          <button
            className={filter === 'all' ? 'active' : ''}
            onClick={() => setFilter('all')}
          >
            All ({stats ? Object.values(stats).reduce((sum, s) => sum + s.pending, 0) : 0})
          </button>
          <button
            className={filter === 'articles' ? 'active' : ''}
            onClick={() => setFilter('articles')}
          >
            Articles ({(stats?.lead?.pending || 0) + (stats?.el_comercio_post?.pending || 0) + (stats?.diario_correo_post?.pending || 0)})
          </button>
          <button
            className={filter === 'instagram_post' ? 'active' : ''}
            onClick={() => setFilter('instagram_post')}
          >
            Instagram ({stats?.instagram_post?.pending || 0})
          </button>
        </div>
      </div>

      {/* Pending Items List */}
      {isLoading ? (
        <div className="loading">Loading pending items...</div>
      ) : (
        <div className="approval-list">
          {pendingItems.map(item => {
            const isTranslated = item.translation_status === 'translated';
            const languageLabel =
              item.detected_language && item.detected_language !== 'en'
                ? getLanguageName(item.detected_language)
                : null;
            const imageUrl = item.content_type === 'instagram_post' && item.image_url
              ? instagramPostImageUrl(item.content_id)
              : item.image_url;

            return (
              <div key={`${item.content_type}-${item.content_id}`} className="approval-card">
                {imageUrl && (
                  <div className="approval-image">
                    <img src={imageUrl} alt={item.title} />
                  </div>
                )}

                <div className="approval-header">
                  <span className={`badge type-badge ${item.content_type === 'instagram_post' ? 'instagram' : ''}`}>
                    {CONTENT_TYPE_LABELS[item.content_type]}
                  </span>
                  <span className="source-badge">{item.source_name}</span>
                </div>

                <h3>
                  {item.title}
                  {isTranslated && <span className="badge translation-badge">Translated</span>}
                  {languageLabel && (
                    <span className="badge language-badge" data-lang-code={item.detected_language.toUpperCase()}>
                      <span className="language-full">{languageLabel}</span>
                      <span className="language-abbrev">{item.detected_language.toUpperCase()}</span>
                    </span>
                  )}
                </h3>
                {item.summary && <p className="summary">{item.summary}</p>}

                <div className="approval-meta">
                  <small>Collected: {new Date(item.collected_at).toLocaleString()}</small>
                  {item.link && (
                    <a href={item.link} target="_blank" rel="noopener noreferrer">
                      View Original →
                    </a>
                  )}
                </div>

                <div className="approval-actions">
                  <button
                    className="button primary"
                    onClick={() => handleApprove(item)}
                    disabled={isMutating}
                  >
                    ✓ Approve
                  </button>
                  <button
                    className="button danger"
                    onClick={() => handleReject(item)}
                    disabled={isMutating}
                  >
                    ✕ Reject
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pendingItems.length === 0 && !isLoading && (
        <div className="empty-state">
          <p>No pending items to review!</p>
        </div>
      )}
    </div>
  );
}
