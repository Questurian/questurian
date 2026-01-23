import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { instagramPostImageUrl, youtubePostsApi } from '../api';
import {
  useCategories,
  useFeeds,
  useInstagramFeeds,
  useInfiniteInstagramPostsList,
  useInfiniteLeadsList,
  useDiarioCorreoFeeds,
  useInfiniteDiarioCorreoPostsList,
  useElComercioFeeds,
  useInfiniteElComercioPostsList,
  useYouTubeFeeds,
  useInfiniteYouTubePostsList,
  useExtractYouTubeTranscript,
  useInfiniteScrapes,
  useSubreddits,
} from '../hooks';

const DASHBOARD_PAGE_SIZE = 15;
const EL_COMERCIO_PAGE_SIZE = DASHBOARD_PAGE_SIZE;
const SCRAPES_PAGE_SIZE = DASHBOARD_PAGE_SIZE;
const RANDOM_SUBREDDIT_COUNT = 6;
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

function formatNumber(value) {
  const num = Number(value ?? 0);
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

function parseDateValue(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (match) {
      const day = Number(match[1]);
      const month = Number(match[2]);
      const year = Number(match[3]);
      const parsed = new Date(year, month - 1, day);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value, withTime = false) {
  const date = parseDateValue(value);
  if (!date) return 'Unknown';
  return withTime ? date.toLocaleString() : date.toLocaleDateString();
}

function getTimestamp(value) {
  const date = parseDateValue(value);
  return date ? date.getTime() : 0;
}

// Extract the best available date from an item based on its type
function getItemDate(item) {
  const { type, data } = item;

  // Try different date fields in order of preference
  const dateFields = [];

  switch (type) {
    case 'lead':
      dateFields.push(data.published, data.collected_at);
      break;
    case 'instagram':
      dateFields.push(data.posted_at, data.collected_at);
      break;
    case 'el_comercio':
    case 'diario_correo':
    case 'youtube':
      dateFields.push(data.published_at, data.collected_at);
      break;
    case 'scrape':
      dateFields.push(data.collected_at);
      break;
    default:
      dateFields.push(data.published, data.published_at, data.posted_at, data.collected_at);
  }

  // Return the first valid date found
  for (const dateField of dateFields) {
    if (dateField) {
      const parsed = parseDateValue(dateField);
      if (parsed) return parsed;
    }
  }

  return null;
}

function buildSubredditUrl(name) {
  if (!name) return 'https://www.reddit.com/';
  return `https://www.reddit.com/r/${name}/`;
}

function truncateText(text, maxLength = 120) {
  if (!text) return 'No description yet.';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

export default function Dashboard() {
  const [searchFilter, setSearchFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showTranslated, setShowTranslated] = useState(true);
  const [transcriptStates, setTranscriptStates] = useState({});
  const [subredditSpotlightExpanded, setSubredditSpotlightExpanded] = useState(false);

  const {
    data: leadsData,
    isLoading: leadsLoading,
    isFetching: leadsFetching,
    isFetchingNextPage: leadsFetchingNextPage,
    fetchNextPage: fetchNextLeads,
    hasNextPage: hasMoreLeads,
    error: leadsError,
  } = useInfiniteLeadsList(
    {
      category: categoryFilter,
      search: searchFilter,
    },
    DASHBOARD_PAGE_SIZE,
  );

  const {
    data: instagramPostsData,
    isLoading: postsLoading,
    isFetching: postsFetching,
    isFetchingNextPage: postsFetchingNextPage,
    fetchNextPage: fetchNextInstagramPosts,
    hasNextPage: hasMoreInstagramPosts,
    error: postsError,
  } = useInfiniteInstagramPostsList(
    {
      category: categoryFilter,
      search: searchFilter,
    },
    DASHBOARD_PAGE_SIZE,
  );

  const {
    data: youtubePostsData,
    isLoading: youtubePostsLoading,
    isFetching: youtubePostsFetching,
    isFetchingNextPage: youtubePostsFetchingNextPage,
    fetchNextPage: fetchNextYouTubePosts,
    hasNextPage: hasMoreYouTubePosts,
    error: youtubePostsError,
  } = useInfiniteYouTubePostsList(
    {
      category: categoryFilter,
      search: searchFilter,
    },
    DASHBOARD_PAGE_SIZE,
  );
  const extractTranscript = useExtractYouTubeTranscript();

  const {
    data: scrapesData,
    isLoading: scrapesLoading,
    isFetching: scrapesFetching,
    isFetchingNextPage: scrapesFetchingNextPage,
    fetchNextPage: fetchNextScrapes,
    hasNextPage: hasMoreScrapes,
    error: scrapesError,
  } = useInfiniteScrapes(
    {
      approval_status: 'approved',
      search: searchFilter,
    },
    SCRAPES_PAGE_SIZE
  );

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
    data: subreddits = [],
    isLoading: subredditsLoading,
    error: subredditsError,
  } = useSubreddits();

  const {
    data: instagramFeeds = [],
    isLoading: instagramFeedsLoading,
    error: instagramFeedsError,
  } = useInstagramFeeds();

  const {
    data: elComercioPostsData,
    isLoading: elComercioPostsLoading,
    isFetching: elComercioPostsFetching,
    isFetchingNextPage: elComercioPostsFetchingNextPage,
    fetchNextPage: fetchNextElComercioPosts,
    hasNextPage: hasMoreElComercioPosts,
    error: elComercioPostsError,
  } = useInfiniteElComercioPostsList(
    {
      approval_status: 'approved',
      search: searchFilter,
    },
    EL_COMERCIO_PAGE_SIZE
  );

  const {
    data: diarioCorreoPostsData,
    isLoading: diarioCorreoPostsLoading,
    isFetching: diarioCorreoPostsFetching,
    isFetchingNextPage: diarioCorreoPostsFetchingNextPage,
    fetchNextPage: fetchNextDiarioCorreoPosts,
    hasNextPage: hasMoreDiarioCorreoPosts,
    error: diarioCorreoPostsError,
  } = useInfiniteDiarioCorreoPostsList(
    {
      approval_status: 'approved',
      search: searchFilter,
    },
    DASHBOARD_PAGE_SIZE,
  );

  const leads = leadsData?.pages.flat() ?? [];
  const posts = instagramPostsData?.pages.flat() ?? [];
  const youtubePosts = youtubePostsData?.pages.flat() ?? [];
  const diarioCorreoPosts = diarioCorreoPostsData?.pages.flat() ?? [];
  const elComercioPosts = elComercioPostsData?.pages.flat() ?? [];
  const scrapes = scrapesData?.pages.flatMap((page) => page.items) ?? [];

  const {
    data: elComercioFeeds = [],
    isLoading: elComercioFeedsLoading,
    error: elComercioFeedsError,
  } = useElComercioFeeds();

  const {
    data: diarioCorreoFeeds = [],
    isLoading: diarioCorreoFeedsLoading,
    error: diarioCorreoFeedsError,
  } = useDiarioCorreoFeeds();

  const {
    data: youtubeFeeds = [],
    isLoading: youtubeFeedsLoading,
    error: youtubeFeedsError,
  } = useYouTubeFeeds();

  const feedNames = useMemo(
    () => new Map(feeds.map((feed) => [feed.id, feed.source_name])),
    [feeds],
  );
  const instagramFeedNames = useMemo(
    () => new Map(instagramFeeds.map((feed) => [feed.id, feed.display_name])),
    [instagramFeeds],
  );
  const feedCategoryIds = useMemo(
    () => new Map(feeds.map((feed) => [feed.id, feed.category_id])),
    [feeds],
  );
  const instagramFeedCategoryIds = useMemo(
    () => new Map(instagramFeeds.map((feed) => [feed.id, feed.category_id])),
    [instagramFeeds],
  );
  const elComercioFeedNames = useMemo(
    () => new Map(elComercioFeeds.map((feed) => [feed.id, feed.display_name])),
    [elComercioFeeds],
  );
  const elComercioFeedCategoryIds = useMemo(
    () => new Map(elComercioFeeds.map((feed) => [feed.id, feed.category_id])),
    [elComercioFeeds],
  );
  const diarioCorreoFeedNames = useMemo(
    () => new Map(diarioCorreoFeeds.map((feed) => [feed.id, feed.display_name])),
    [diarioCorreoFeeds],
  );
  const diarioCorreoFeedCategoryIds = useMemo(
    () => new Map(diarioCorreoFeeds.map((feed) => [feed.id, feed.category_id])),
    [diarioCorreoFeeds],
  );
  const youtubeFeedNames = useMemo(
    () => new Map(youtubeFeeds.map((feed) => [feed.id, feed.display_name])),
    [youtubeFeeds],
  );
  const youtubeFeedCategoryIds = useMemo(
    () => new Map(youtubeFeeds.map((feed) => [feed.id, feed.category_id])),
    [youtubeFeeds],
  );
  const categoryNames = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  );
  const subredditPicks = useMemo(() => {
    if (!Array.isArray(subreddits) || subreddits.length === 0) return [];
    const shuffled = [...subreddits].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, RANDOM_SUBREDDIT_COUNT);
  }, [subreddits]);

  const combinedItems = useMemo(() => {
    const leadItems = leads.map((lead) => ({ type: 'lead', data: lead }));
    const instagramItems = posts.map((post) => ({ type: 'instagram', data: post }));
    const elComercioItems = elComercioPosts.map((post) => ({ type: 'el_comercio', data: post }));
    const diarioCorreoItems = diarioCorreoPosts.map((post) => ({ type: 'diario_correo', data: post }));
    const youtubeItems = youtubePosts.map((post) => ({ type: 'youtube', data: post }));
    const scrapesItems = scrapes.map((scrape) => ({ type: 'scrape', data: scrape }));
    return [
      ...leadItems,
      ...instagramItems,
      ...elComercioItems,
      ...diarioCorreoItems,
      ...youtubeItems,
      ...scrapesItems,
    ];
  }, [leads, posts, elComercioPosts, diarioCorreoPosts, youtubePosts, scrapes]);

  const sortedItems = useMemo(() => {
    return [...combinedItems].sort((a, b) => {
      const aDate = getItemDate(a);
      const bDate = getItemDate(b);
      const aTimestamp = aDate ? aDate.getTime() : 0;
      const bTimestamp = bDate ? bDate.getTime() : 0;
      return bTimestamp - aTimestamp; // Descending order (newest first)
    });
  }, [combinedItems]);

  const totalCount = combinedItems.length;
  const [visibleCount, setVisibleCount] = useState(DASHBOARD_PAGE_SIZE);
  const loadMoreRef = useRef(null);
  const canObserve = typeof IntersectionObserver !== 'undefined';
  const isLoading =
    leadsLoading || postsLoading || feedsLoading || instagramFeedsLoading || categoriesLoading ||
    elComercioPostsLoading || elComercioFeedsLoading ||
    diarioCorreoPostsLoading || diarioCorreoFeedsLoading ||
    youtubePostsLoading || youtubeFeedsLoading || scrapesLoading;
  const isFetching =
    (leadsFetching && !leadsFetchingNextPage) ||
    (postsFetching && !postsFetchingNextPage) ||
    (diarioCorreoPostsFetching && !diarioCorreoPostsFetchingNextPage) ||
    (youtubePostsFetching && !youtubePostsFetchingNextPage) ||
    (elComercioPostsFetching && !elComercioPostsFetchingNextPage) ||
    (scrapesFetching && !scrapesFetchingNextPage);
  const isLoadingMore =
    leadsFetchingNextPage ||
    postsFetchingNextPage ||
    diarioCorreoPostsFetchingNextPage ||
    youtubePostsFetchingNextPage ||
    elComercioPostsFetchingNextPage ||
    scrapesFetchingNextPage;
  const hasMoreItems =
    hasMoreLeads ||
    hasMoreInstagramPosts ||
    hasMoreDiarioCorreoPosts ||
    hasMoreYouTubePosts ||
    hasMoreElComercioPosts ||
    hasMoreScrapes;
  const error = leadsError || postsError || feedsError || instagramFeedsError || categoriesError ||
    elComercioPostsError || elComercioFeedsError ||
    diarioCorreoPostsError || diarioCorreoFeedsError ||
    youtubePostsError || youtubeFeedsError || scrapesError;

  useEffect(() => {
    setVisibleCount(DASHBOARD_PAGE_SIZE);
  }, [categoryFilter, searchFilter]);

  const loadMoreItems = useCallback(() => {
    setVisibleCount((prev) => prev + DASHBOARD_PAGE_SIZE);

    if (hasMoreLeads && !leadsFetchingNextPage) {
      fetchNextLeads();
    }
    if (hasMoreInstagramPosts && !postsFetchingNextPage) {
      fetchNextInstagramPosts();
    }
    if (hasMoreYouTubePosts && !youtubePostsFetchingNextPage) {
      fetchNextYouTubePosts();
    }
    if (hasMoreDiarioCorreoPosts && !diarioCorreoPostsFetchingNextPage) {
      fetchNextDiarioCorreoPosts();
    }
    if (hasMoreElComercioPosts && !elComercioPostsFetchingNextPage) {
      fetchNextElComercioPosts();
    }
    if (hasMoreScrapes && !scrapesFetchingNextPage) {
      fetchNextScrapes();
    }
  }, [
    fetchNextDiarioCorreoPosts,
    fetchNextElComercioPosts,
    fetchNextInstagramPosts,
    fetchNextLeads,
    fetchNextScrapes,
    fetchNextYouTubePosts,
    hasMoreDiarioCorreoPosts,
    hasMoreElComercioPosts,
    hasMoreInstagramPosts,
    hasMoreLeads,
    hasMoreScrapes,
    hasMoreYouTubePosts,
    diarioCorreoPostsFetchingNextPage,
    elComercioPostsFetchingNextPage,
    leadsFetchingNextPage,
    postsFetchingNextPage,
    scrapesFetchingNextPage,
    youtubePostsFetchingNextPage,
  ]);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !canObserve) return;
    if (!hasMoreItems && visibleCount >= sortedItems.length) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        if (isLoadingMore) return;
        if (!hasMoreItems && visibleCount >= sortedItems.length) return;
        loadMoreItems();
      },
      { rootMargin: '200px' }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [canObserve, hasMoreItems, isLoadingMore, loadMoreItems, visibleCount, sortedItems.length]);

  const visibleItems = sortedItems.slice(0, visibleCount);

  async function handleExtractTranscript(postId) {
    setTranscriptStates((prev) => ({ ...prev, [postId]: { loading: true } }));
    try {
      const result = await extractTranscript.mutateAsync(postId);
      setTranscriptStates((prev) => ({
        ...prev,
        [postId]: {
          loading: false,
          status: result.transcript_status,
          error: result.transcript_error,
          hasTranscript: !!result.transcript,
        },
      }));
    } catch (err) {
      setTranscriptStates((prev) => ({
        ...prev,
        [postId]: { loading: false, error: err.message },
      }));
    }
  }

  function handleDownloadTranscript(postId) {
    window.open(youtubePostsApi.downloadTranscriptUrl(postId), '_blank');
  }

  function renderLeadCard(lead) {
    const displayTitle = showTranslated && lead.title_translated
      ? lead.title_translated
      : lead.title;

    const rawSummary = showTranslated && lead.summary_translated
      ? lead.summary_translated
      : lead.summary;

    const summary = cleanLeadSummary(rawSummary);
    const isTranslated = lead.translation_status === 'translated';
    const languageLabel = lead.detected_language && lead.detected_language !== 'en'
      ? getLanguageName(lead.detected_language)
      : null;

    const categoryName =
      categoryNames.get(feedCategoryIds.get(lead.feed_id)) || categoryFilter || 'Unknown';

    return (
      <div key={`lead-${lead.id}`} className="lead-card lead-card-article">
        {lead.image_url && (
          <div className="lead-image">
            <img src={lead.image_url} alt={displayTitle} loading="lazy" />
          </div>
        )}
        <div className="lead-header">
          <h3>
            {lead.link ? (
              <a href={lead.link} target="_blank" rel="noopener noreferrer">
                {displayTitle}
              </a>
            ) : (
              displayTitle
            )}
          </h3>
        </div>

        <div className="lead-badges">
          <span className="badge">{categoryName}</span>
          <span className="badge">{feedNames.get(lead.feed_id) || 'Unknown Feed'}</span>
          {isTranslated && <span className="badge translation-badge">Translated</span>}
          {languageLabel && (
            <span className="badge language-badge" data-lang-code={lead.detected_language.toUpperCase()}>
              <span className="language-full">{languageLabel}</span>
              <span className="language-abbrev">{lead.detected_language.toUpperCase()}</span>
            </span>
          )}
        </div>

        <div className="lead-meta">
          {lead.author && <span>By {lead.author}</span>}
          <span className="published-date">
            {lead.published
              ? formatDate(lead.published)
              : formatDate(lead.collected_at)}
          </span>
        </div>
        <div className="lead-footer">
          {!showTranslated && lead.title_translated && (
            <small className="translation-hint">English translation available</small>
          )}
        </div>
      </div>
    );
  }

  function renderInstagramCard(post) {
    const displayCaption = showTranslated && post.caption_translated
      ? post.caption_translated
      : post.caption;
    const isTranslated = post.translation_status === 'translated';
    const languageLabel = post.detected_language && post.detected_language !== 'en'
      ? getLanguageName(post.detected_language)
      : null;
    const mediaUrl = post.media_url || post.thumbnail_url;
    const showVideo = post.media_type === 'video' && post.media_url;
    const imageUrl = mediaUrl ? instagramPostImageUrl(post.id) : null;
    const posterUrl = post.thumbnail_url ? instagramPostImageUrl(post.id) : null;
    const usernameLabel = post.username ? `@${post.username}` : 'Instagram post';
    const categoryName =
      categoryNames.get(instagramFeedCategoryIds.get(post.instagram_feed_id))
      || categoryFilter
      || 'Unknown';

    return (
      <div key={`instagram-${post.id}`} className="lead-card lead-card-instagram">
        <div className="lead-header">
          <h3>
            {post.permalink ? (
              <a href={post.permalink} target="_blank" rel="noopener noreferrer">
                {usernameLabel}
              </a>
            ) : (
              usernameLabel
            )}
          </h3>
        </div>

        <div className="lead-badges">
          <span className="badge">{categoryName}</span>
          <span className="badge">
            {instagramFeedNames.get(post.instagram_feed_id) || 'Unknown Feed'}
          </span>
          {isTranslated && <span className="badge translation-badge">Translated</span>}
          {languageLabel && (
            <span className="badge language-badge" data-lang-code={post.detected_language.toUpperCase()}>
              <span className="language-full">{languageLabel}</span>
              <span className="language-abbrev">{post.detected_language.toUpperCase()}</span>
            </span>
          )}
        </div>

        <div className="instagram-content">
          {imageUrl && (
            <div className="instagram-media">
              {showVideo ? (
                <video controls poster={posterUrl || undefined}>
                  <source src={post.media_url} type="video/mp4" />
                </video>
              ) : (
                <img src={imageUrl} alt="Instagram post" loading="lazy" />
              )}
            </div>
          )}

          <div className="instagram-caption-section">
            {displayCaption && (
              <p className="instagram-caption">{displayCaption}</p>
            )}

            <div className="instagram-stats">
              <span>{formatNumber(post.like_count)} likes</span>
              <span>{formatNumber(post.comment_count)} comments</span>
              {post.view_count && <span>{formatNumber(post.view_count)} views</span>}
              {post.media_type && <span className="media-type-badge">{post.media_type}</span>}
            </div>

            <div className="lead-meta">
              <span className="published-date">
                {post.posted_at
                  ? formatDate(post.posted_at)
                  : formatDate(post.collected_at)}
              </span>
            </div>
          </div>
        </div>

        <div className="lead-footer">
          {!showTranslated && post.caption_translated && (
            <small className="translation-hint">English translation available</small>
          )}
        </div>
      </div>
    );
  }

  function renderElComercioCard(post) {
    const displayTitle = showTranslated && post.title_translated
      ? post.title_translated
      : post.title;

    const displayExcerpt = showTranslated && post.excerpt_translated
      ? post.excerpt_translated
      : post.excerpt;

    const isTranslated = post.translation_status === 'translated';
    const languageLabel = post.detected_language && post.detected_language !== 'en'
      ? getLanguageName(post.detected_language)
      : null;

    const categoryName =
      categoryNames.get(elComercioFeedCategoryIds.get(post.el_comercio_feed_id))
      || categoryFilter
      || 'Unknown';

    return (
      <div key={`el_comercio-${post.id}`} className="lead-card lead-card-el-comercio">
        {post.image_url && (
          <div className="lead-image">
            <img src={post.image_url} alt={displayTitle} loading="lazy" />
          </div>
        )}
        <div className="lead-header">
          <h3>
            {post.url ? (
              <a href={post.url} target="_blank" rel="noopener noreferrer">
                {displayTitle}
              </a>
            ) : (
              displayTitle
            )}
          </h3>
        </div>

        <div className="lead-badges">
          <span className="badge">{categoryName}</span>
          <span className="badge">{elComercioFeedNames.get(post.el_comercio_feed_id) || 'Unknown Feed'}</span>
          {isTranslated && <span className="badge translation-badge">Translated</span>}
          {languageLabel && (
            <span className="badge language-badge" data-lang-code={post.detected_language.toUpperCase()}>
              <span className="language-full">{languageLabel}</span>
              <span className="language-abbrev">{post.detected_language.toUpperCase()}</span>
            </span>
          )}
        </div>

        {displayExcerpt && (
          <div className="lead-content">
            <p>{displayExcerpt}</p>
          </div>
        )}

        <div className="lead-meta">
          <span className="published-date">
            {post.published_at
              ? formatDate(post.published_at)
              : formatDate(post.collected_at)}
          </span>
        </div>
        <div className="lead-footer">
          {!showTranslated && post.title_translated && (
            <small className="translation-hint">English translation available</small>
          )}
        </div>
      </div>
    );
  }

  function renderDiarioCorreoCard(post) {
    const displayTitle = showTranslated && post.title_translated
      ? post.title_translated
      : post.title;

    const displayExcerpt = showTranslated && post.excerpt_translated
      ? post.excerpt_translated
      : post.excerpt;

    const isTranslated = post.translation_status === 'translated';
    const languageLabel = post.detected_language && post.detected_language !== 'en'
      ? getLanguageName(post.detected_language)
      : null;

    const categoryName =
      categoryNames.get(diarioCorreoFeedCategoryIds.get(post.diario_correo_feed_id))
      || categoryFilter
      || 'Unknown';

    return (
      <div key={`diario_correo-${post.id}`} className="lead-card lead-card-diario-correo">
        {post.image_url && (
          <div className="lead-image">
            <img src={post.image_url} alt={displayTitle} loading="lazy" />
          </div>
        )}
        <div className="lead-header">
          <h3>
            {post.url ? (
              <a href={post.url} target="_blank" rel="noopener noreferrer">
                {displayTitle}
              </a>
            ) : (
              displayTitle
            )}
          </h3>
        </div>

        <div className="lead-badges">
          <span className="badge">{categoryName}</span>
          <span className="badge">
            {diarioCorreoFeedNames.get(post.diario_correo_feed_id) || 'Unknown Feed'}
          </span>
          {isTranslated && <span className="badge translation-badge">Translated</span>}
          {languageLabel && (
            <span className="badge language-badge" data-lang-code={post.detected_language.toUpperCase()}>
              <span className="language-full">{languageLabel}</span>
              <span className="language-abbrev">{post.detected_language.toUpperCase()}</span>
            </span>
          )}
        </div>

        {displayExcerpt && (
          <div className="lead-content">
            <p>{displayExcerpt}</p>
          </div>
        )}

        <div className="lead-meta">
          <span className="published-date">
            {post.published_at
              ? formatDate(post.published_at)
              : formatDate(post.collected_at)}
          </span>
        </div>
        <div className="lead-footer">
          {!showTranslated && post.title_translated && (
            <small className="translation-hint">English translation available</small>
          )}
        </div>
      </div>
    );
  }

  function renderYouTubeCard(post) {
    const categoryName =
      categoryNames.get(youtubeFeedCategoryIds.get(post.youtube_feed_id))
      || categoryFilter
      || 'Unknown';
    const channelLabel =
      youtubeFeedNames.get(post.youtube_feed_id) || 'Unknown Channel';

    return (
      <div key={`youtube-${post.id}`} className="lead-card lead-card-youtube">
        {post.thumbnail_url && (
          <div className="lead-image">
            <img src={post.thumbnail_url} alt={post.title} loading="lazy" />
          </div>
        )}
        <div className="lead-header">
          <h3>
            {post.video_url ? (
              <a href={post.video_url} target="_blank" rel="noopener noreferrer">
                {post.title}
              </a>
            ) : (
              post.title
            )}
          </h3>
        </div>

        <div className="lead-badges">
          <span className="badge">{categoryName}</span>
          <span className="badge">{channelLabel}</span>
        </div>

        <div className="lead-meta">
          <span className="published-date">
            {post.published_at
              ? formatDate(post.published_at)
              : formatDate(post.collected_at)}
          </span>
        </div>

        <div className="lead-footer">
        </div>

        <div className="transcript-actions" style={{ marginTop: '12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
          {(() => {
            const state = transcriptStates[post.id];
            const hasExistingTranscript = post.transcript_status === 'completed';
            const isUnavailable = post.transcript_status === 'unavailable' || state?.status === 'unavailable';

            if (state?.loading) {
              return <span className="badge">Extracting transcript...</span>;
            }

            if (hasExistingTranscript || state?.hasTranscript) {
                      return (
                        <button
                          className="button"
                          onClick={() => handleDownloadTranscript(post.id)}
                        >
                          Download CSV
                        </button>
                      );
                    }

            if (isUnavailable) {
              return <span className="badge" style={{ background: '#888' }}>No transcript available</span>;
            }

            if (state?.error && state?.status === 'failed') {
              return (
                <>
                  <span className="badge" style={{ background: '#c00' }}>Failed</span>
                  <button
                    className="button secondary"
                    onClick={() => handleExtractTranscript(post.id)}
                  >
                    Retry
                  </button>
                </>
              );
            }

            return (
              <button
                className="button secondary"
                onClick={() => handleExtractTranscript(post.id)}
              >
                Get Transcript
              </button>
            );
          })()}
        </div>
      </div>
    );
  }

  function renderScrapeCard(scrape) {
    const CONTENT_TYPE_LABELS = {
      el_comercio_post: 'El Comercio',
      diario_correo_post: 'Diario Correo',
    };

    const label = CONTENT_TYPE_LABELS[scrape.content_type] || scrape.content_type;
    const sourceName = scrape.source_name || 'Unknown';
    const isTranslated = scrape.translation_status === 'translated';
    const languageLabel = scrape.detected_language && scrape.detected_language !== 'en'
      ? getLanguageName(scrape.detected_language)
      : null;
    const displayTitle = scrape.title || 'Untitled';
    const displaySummary = scrape.summary;
    const topBarLabel = label || 'Scrape';

    return (
      <div
        key={`${scrape.content_type}-${scrape.content_id}`}
        className="lead-card lead-card-scrape"
        data-lead-label={topBarLabel}
      >
        {scrape.image_url && (
          <div className="lead-image">
            <img src={scrape.image_url} alt={displayTitle || 'Scraped item'} loading="lazy" />
          </div>
        )}

        <div className="lead-header">
          <h3>
            {scrape.link ? (
              <a href={scrape.link} target="_blank" rel="noopener noreferrer">
                {displayTitle}
              </a>
            ) : (
              displayTitle
            )}
          </h3>
        </div>

        <div className="lead-badges">
          <span className="badge">{label}</span>
          <span className="badge">{sourceName}</span>
          {isTranslated && <span className="badge translation-badge">Translated</span>}
          {languageLabel && (
            <span className="badge language-badge" data-lang-code={scrape.detected_language.toUpperCase()}>
              <span className="language-full">{languageLabel}</span>
              <span className="language-abbrev">{scrape.detected_language.toUpperCase()}</span>
            </span>
          )}
        </div>

        {displaySummary && (
          <div className="lead-content">
            <p>{displaySummary}</p>
          </div>
        )}

        <div className="lead-meta">
          <span className="published-date">{formatDate(scrape.collected_at)}</span>
        </div>

        <div className="lead-footer">
        </div>
      </div>
    );
  }

  const emptyMessage = categoryFilter || searchFilter
    ? 'No approved content matches your filters.'
    : 'No approved content yet. Review pending items in the approval queue.';

  return (
    <div className="page">
      {isFetching && !isLoading && <div className="badge">Refreshing...</div>}

      {error && <div className="error">{error.message}</div>}

      <div className="subreddit-spotlight card">
        <div className="subreddit-spotlight-header">
          <div>
            <h3>Reddit Quick Picks</h3>
            {!subredditSpotlightExpanded && (
              <p className="subreddit-spotlight-subtitle">
                Random picks from your saved subreddits for quick browsing.
              </p>
            )}
          </div>
          <div className="subreddit-spotlight-actions">
            {!subredditSpotlightExpanded ? (
              <button
                className="button secondary button-sm"
                onClick={() => setSubredditSpotlightExpanded(true)}
              >
                Expand
              </button>
            ) : (
              <>
                <Link className="button secondary button-sm" to="/subreddit-browser">
                  Browse All
                </Link>
                <Link className="button button-sm" to="/subreddits">
                  Manage
                </Link>
                <button
                  className="button secondary button-sm"
                  onClick={() => setSubredditSpotlightExpanded(false)}
                >
                  Collapse
                </button>
              </>
            )}
          </div>
        </div>

        <div className={`subreddit-spotlight-content ${subredditSpotlightExpanded ? 'expanded' : 'collapsed'}`}>
          {subredditsLoading && (
            <p className="subreddit-spotlight-empty">Loading subreddit picks...</p>
          )}

          {!subredditsLoading && subredditsError && (
            <p className="error-text">
              Subreddit picks unavailable: {subredditsError.message}
            </p>
          )}

          {!subredditsLoading && !subredditsError && subredditPicks.length === 0 && (
            <p className="subreddit-spotlight-empty">
              No subreddits yet. Add a few to show random picks here.
            </p>
          )}

          {!subredditsLoading && !subredditsError && subredditPicks.length > 0 && (
            <div className="subreddit-grid">
              {subredditPicks.map((subreddit) => (
                <div key={subreddit.id} className="card subreddit-card">
                  <div className="subreddit-card-header">
                    <div>
                      <div className="subreddit-title">
                        {subreddit.display_name || `r/${subreddit.subreddit}`}
                      </div>
                      <a
                        className="subreddit-link"
                        href={buildSubredditUrl(subreddit.subreddit)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        r/{subreddit.subreddit}
                      </a>
                    </div>
                    <span className="badge">
                      {categoryNames.get(subreddit.category_id) || 'Unknown'}
                    </span>
                  </div>
                  <p className="subreddit-description">
                    {truncateText(subreddit.description)}
                  </p>
                  <div className="subreddit-actions">
                    <span className="subreddit-action-label">Open</span>
                    <a
                      className="subreddit-chip"
                      href={buildSubredditUrl(subreddit.subreddit)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Visit Reddit
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="filters card">
        <h3>Filters</h3>
        <div className="filters-grid">
          <div className="form-group">
            <label>Search</label>
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Search titles, summaries, captions, usernames..."
            />
          </div>
          <div className="form-group">
            <label>Category</label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              disabled={categoriesLoading}
            >
              <option value="">All Categories</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.name}>{cat.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {isLoading && totalCount === 0 ? (
        <div className="loading">Loading approved content...</div>
      ) : (
        <div className="leads-list">
          {visibleItems.map((item) => {
            if (item.type === 'lead') return renderLeadCard(item.data);
            if (item.type === 'instagram') return renderInstagramCard(item.data);
            if (item.type === 'el_comercio') return renderElComercioCard(item.data);
            if (item.type === 'diario_correo') return renderDiarioCorreoCard(item.data);
            if (item.type === 'youtube') return renderYouTubeCard(item.data);
            if (item.type === 'scrape') return renderScrapeCard(item.data);
            return null;
          })}
        </div>
      )}

      {(hasMoreItems || visibleCount < sortedItems.length) && (
        <div className="load-more" ref={loadMoreRef}>
          {!canObserve && (
            <button
              className="button secondary"
              onClick={loadMoreItems}
              disabled={isLoadingMore}
            >
              {isLoadingMore ? 'Loading more...' : 'Load more'}
            </button>
          )}
          {canObserve && isLoadingMore && (
            <div className="loading">Loading more...</div>
          )}
        </div>
      )}

      {sortedItems.length === 0 && !isLoading && (
        <div className="empty-state">
          <p>{emptyMessage}</p>
        </div>
      )}
    </div>
  );
}
