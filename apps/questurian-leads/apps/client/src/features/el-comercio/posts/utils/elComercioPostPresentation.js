export function formatElComercioPublishedDate(value) {
  if (!value) return 'Unknown';
  const parts = value.split('/');

  if (parts.length === 3) {
    const [day, month, year] = parts;
    return `${month}/${day}/${year}`;
  }

  return new Date(value).toLocaleDateString();
}

export function getElComercioApprovalBadgeClass(status) {
  if (status === 'approved') return 'success';
  if (status === 'rejected') return 'danger';
  return 'warning';
}

export function buildElComercioPostViewModel(post, feedNames) {
  const isTranslated = post.translation_status === 'translated';

  return {
    ...post,
    approvalBadgeClass: getElComercioApprovalBadgeClass(post.approval_status),
    collectedAtLabel: new Date(post.collected_at).toLocaleString(),
    displayExcerpt: post.excerpt_translated || post.excerpt,
    displayTitle: post.title_translated || post.title,
    feedName: feedNames.get(post.el_comercio_feed_id) || 'Unknown',
    isTranslated,
    publishedAtLabel: formatElComercioPublishedDate(post.published_at),
    translatedAtLabel:
      isTranslated && post.translated_at
        ? new Date(post.translated_at).toLocaleString()
        : null,
  };
}
