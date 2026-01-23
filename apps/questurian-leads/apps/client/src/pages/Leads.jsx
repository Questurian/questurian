import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useCategories,
  useDeleteLead,
  useDetectLeadLanguages,
  useFeeds,
  useLeadsList,
  useTags,
  useTranslateLeads,
} from '../hooks';
import { useDialog } from '../providers/DialogProvider';

const SUMMARY_SUFFIX_RE = /\s*The post\b[\s\S]*?\bfirst appeared on\b[\s\S]*$/i;

// Language code to full name mapping (ISO 639-1)
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

function cleanLeadSummary(summary) {
  if (!summary) return '';

  if (typeof DOMParser === 'undefined') {
    return summary
      .replace(/<[^>]*>/g, ' ')
      .replace(SUMMARY_SUFFIX_RE, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const doc = new DOMParser().parseFromString(summary, 'text/html');
  const paragraphs = Array.from(doc.body.querySelectorAll('p'))
    .map(p => (p.textContent || '').trim())
    .filter(Boolean);

  const text = paragraphs.length ? paragraphs[0] : (doc.body.textContent || '');

  return text
    .replace(SUMMARY_SUFFIX_RE, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export default function Leads() {
  const [filters, setFilters] = useState({
    search: '',
    category: '',
    tag: '',
    feed_id: '',
  });
  const [showTranslated, setShowTranslated] = useState(true); // Default to showing English
  const dialog = useDialog();
  const {
    data: leads = [],
    isLoading: leadsLoading,
    isFetching: leadsFetching,
    error: leadsError,
  } = useLeadsList(filters);
  const {
    data: feeds = [],
    isLoading: feedsLoading,
    error: feedsError,
  } = useFeeds();
  const {
    data: categories = [],
    isLoading: categoriesLoading,
    error: categoriesError,
  } = useCategories();
  const {
    data: tags = [],
    isLoading: tagsLoading,
    error: tagsError,
  } = useTags();

  const deleteLead = useDeleteLead();
  const translateLeads = useTranslateLeads();
  const detectLanguages = useDetectLeadLanguages();

  const isLoading = leadsLoading || feedsLoading || categoriesLoading || tagsLoading;
  const error = leadsError || feedsError || categoriesError || tagsError;
  const isMutating =
    deleteLead.isPending || translateLeads.isPending || detectLanguages.isPending;

  async function handleDelete(id) {
    const confirmed = await dialog.confirm('Are you sure you want to delete this lead?');
    if (!confirmed) return;
    try {
      await deleteLead.mutateAsync(id);
    } catch (err) {
      await dialog.alert(`Error: ${err.message}`);
    }
  }

  function getFeedName(feedId) {
    const feed = feeds.find(f => f.id === feedId);
    return feed ? feed.source_name : 'Unknown';
  }

  function handleFilterChange(key, value) {
    setFilters(prev => ({ ...prev, [key]: value }));
  }

  function clearFilters() {
    setFilters({
      search: '',
      category: '',
      tag: '',
      feed_id: '',
    });
  }

  async function handleTranslate() {
    const confirmed = await dialog.confirm('Translate all pending leads to English?');
    if (!confirmed) return;
    try {
      const result = await translateLeads.mutateAsync(filters);
      await dialog.alert(
        `Translation complete!\n${result.stats.translated} translated\n${result.stats.already_english} already in English`,
      );
    } catch (err) {
      await dialog.alert(`Error: ${err.message}`);
    }
  }

  async function handleDetectLanguages() {
    const confirmed = await dialog.confirm(
      'Re-detect language for ALL leads? This will fix any incorrect language detections.',
    );
    if (!confirmed) return;
    try {
      // Force re-detection for all leads (not just NULL ones)
      const result = await detectLanguages.mutateAsync(true);
      await dialog.alert(`Language detection complete!\n${result.leads_updated} leads updated`);
    } catch (err) {
      await dialog.alert(`Error: ${err.message}`);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Leads</h1>
        <div className="page-actions">
          <Link to="/feeds" className="button secondary">Manage Article Feeds</Link>
        </div>
        <div className="lead-count">{leads.length} leads found</div>
      </div>

      {leadsFetching && !leadsLoading && <div className="badge">Refreshing...</div>}

      {error && <div className="error">{error.message}</div>}

      <div className="filters card">
        <h3>Filters</h3>
        <div className="filters-grid">
          <div className="form-group">
            <label>Search</label>
            <input
              type="text"
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              placeholder="Search in title, summary, content..."
            />
          </div>
          <div className="form-group">
            <label>Category</label>
            <select
              value={filters.category}
              onChange={(e) => handleFilterChange('category', e.target.value)}
            >
              <option value="">All Categories</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.name}>{cat.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Tag</label>
            <select
              value={filters.tag}
              onChange={(e) => handleFilterChange('tag', e.target.value)}
            >
              <option value="">All Tags</option>
              {tags.map(tag => (
                <option key={tag.id} value={tag.name}>{tag.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Feed</label>
            <select
              value={filters.feed_id}
              onChange={(e) => handleFilterChange('feed_id', e.target.value)}
            >
              <option value="">All Feeds</option>
              {feeds.map(feed => (
                <option key={feed.id} value={feed.id}>{feed.source_name}</option>
              ))}
            </select>
          </div>
        </div>
        <button className="button secondary" onClick={clearFilters}>
          Clear Filters
        </button>
      </div>

      <div className="translation-controls card">
        <div className="translation-header">
          <h3>Translation</h3>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className="button secondary"
              onClick={handleDetectLanguages}
              disabled={detectLanguages.isPending}
            >
              {detectLanguages.isPending ? 'Detecting...' : 'Detect Languages'}
            </button>
            <button
              className="button primary"
              onClick={handleTranslate}
              disabled={translateLeads.isPending}
            >
              {translateLeads.isPending ? 'Translating...' : 'Translate Pending Leads'}
            </button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="loading">Loading leads...</div>
      ) : (
        <div className="leads-list">
          {leads.map((lead) => {
            // Determine which text to show based on toggle and availability
            const displayTitle = showTranslated && lead.title_translated
              ? lead.title_translated
              : lead.title;

            const rawSummary = showTranslated && lead.summary_translated
              ? lead.summary_translated
              : lead.summary;

            const summary = cleanLeadSummary(rawSummary);

            const isTranslated = lead.translation_status === 'translated';
            const isEnglish = lead.translation_status === 'already_english';

            return (
              <div key={lead.id} className="lead-card">
                {lead.image_url && (
                  <div className="lead-image">
                    <img src={lead.image_url} alt={displayTitle} loading="lazy" />
                  </div>
                )}
                <div className="lead-header">
                  <h3>
                    <a href={lead.link} target="_blank" rel="noopener noreferrer">
                      {displayTitle}
                    </a>
                  </h3>
                  <button className="button-sm danger" onClick={() => handleDelete(lead.id)} disabled={isMutating}>
                    Delete
                  </button>
                </div>

                <div className="lead-badges">
                  <span className={`badge ${getFeedName(lead.feed_id).toLowerCase().includes('instagram') ? 'instagram' : ''}`}>{getFeedName(lead.feed_id)}</span>
                  {isTranslated && <span className="badge translation-badge">Translated</span>}
                  {lead.detected_language && lead.detected_language !== 'en' && (
                    <span className="badge language-badge" data-lang-code={lead.detected_language.toUpperCase()}>
                      <span className="language-full">{getLanguageName(lead.detected_language)}</span>
                      <span className="language-abbrev">{lead.detected_language.toUpperCase()}</span>
                    </span>
                  )}
                </div>

                <div className="lead-meta">
                  {lead.author && <span>By {lead.author}</span>}
                  {lead.published && <span>{new Date(lead.published).toLocaleDateString()}</span>}
                </div>
                {summary && (
                  <p className="lead-summary">{summary}</p>
                )}
                <div className="lead-footer">
                  <small>Collected: {new Date(lead.collected_at).toLocaleString()}</small>
                  {!showTranslated && lead.title_translated && (
                    <small className="translation-hint">English translation available</small>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {leads.length === 0 && !isLoading && (
        <div className="empty-state">
          <p>No leads found. Try adjusting your filters or fetch some feeds!</p>
        </div>
      )}
    </div>
  );
}
