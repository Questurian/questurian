import { getLanguageName } from '../../../utils/contentLanguage';
import { cleanLeadSummary } from '../../../utils/leadSummary';

export function buildLeadResultModel({ feedName, lead, showTranslated }) {
  const resolvedFeedName = feedName || 'Unknown';
  const displayTitle =
    showTranslated && lead.title_translated ? lead.title_translated : lead.title;
  const rawSummary =
    showTranslated && lead.summary_translated
      ? lead.summary_translated
      : lead.summary;

  return {
    author: lead.author || null,
    collectedLabel: new Date(lead.collected_at).toLocaleString(),
    displayTitle,
    feedBadgeClass: resolvedFeedName.toLowerCase().includes('instagram')
      ? 'instagram'
      : '',
    feedName: resolvedFeedName,
    hasTranslationHint: !showTranslated && Boolean(lead.title_translated),
    id: lead.id,
    imageUrl: lead.image_url,
    isTranslated: lead.translation_status === 'translated',
    languageCode: lead.detected_language?.toUpperCase() || null,
    languageLabel:
      lead.detected_language && lead.detected_language !== 'en'
        ? getLanguageName(lead.detected_language)
        : null,
    link: lead.link,
    publishedLabel: lead.published
      ? new Date(lead.published).toLocaleDateString()
      : null,
    summary: cleanLeadSummary(rawSummary),
  };
}
