import { instagramPostImageUrl } from '../../../api';
import { getLanguageName } from '../../../utils/contentLanguage';
import { APPROVAL_CONTENT_TYPE_LABELS } from '../constants/approval.constants';

export function formatApprovalDateTime(value) {
  if (!value) return 'Unknown';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

export function buildApprovalTabCounts(stats) {
  return {
    all: stats
      ? Object.values(stats).reduce(
          (total, entry) => total + (entry?.pending || 0),
          0,
        )
      : 0,
    articles:
      (stats?.lead?.pending || 0) +
      (stats?.el_comercio_post?.pending || 0) +
      (stats?.diario_correo_post?.pending || 0),
    instagram: stats?.instagram_post?.pending || 0,
  };
}

export function buildApprovalItemViewModel(item) {
  const isTranslated = item.translation_status === 'translated';
  const languageLabel =
    item.detected_language && item.detected_language !== 'en'
      ? getLanguageName(item.detected_language)
      : null;
  const imageUrl =
    item.content_type === 'instagram_post' && item.image_url
      ? instagramPostImageUrl(item.content_id)
      : item.image_url;
  const displayDate = item.published_at || item.collected_at;
  const displayDateLabel = item.published_at ? 'Published' : 'Collected';

  return {
    ...item,
    contentTypeLabel:
      APPROVAL_CONTENT_TYPE_LABELS[item.content_type] || item.content_type,
    displayDate,
    displayDateLabel,
    imageUrl,
    isTranslated,
    languageCode: item.detected_language?.toUpperCase() || null,
    languageLabel,
  };
}
