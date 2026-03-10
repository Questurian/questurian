import {
  buildInstagramPostViewModel,
  formatInstagramMetric,
} from '../utils/instagramPostPresentation';

export default function InstagramPostCard({
  feedNames,
  isMutating,
  onDelete,
  post,
}) {
  const viewModel = buildInstagramPostViewModel(post, feedNames);

  return (
    <div className="lead-card instagram-post-card">
      <div className="lead-header">
        <div>
          <h3>
            <a href={viewModel.permalink} target="_blank" rel="noopener noreferrer">
              @{viewModel.username}
            </a>
            {viewModel.isTranslated && (
              <span className="badge translation-badge">Translated</span>
            )}
            {viewModel.detected_language && viewModel.detected_language !== 'en' && (
              <span className="badge language-badge">
                {viewModel.detected_language}
              </span>
            )}
          </h3>
          <span className="badge">{viewModel.feedName}</span>
        </div>
        <button
          className="button-sm danger"
          onClick={() => onDelete(viewModel.id)}
          disabled={isMutating}
        >
          Delete
        </button>
      </div>

      <div className="instagram-content">
        {viewModel.imageUrl && (
          <div className="instagram-media">
            {viewModel.showVideo ? (
              <video controls poster={viewModel.posterUrl || undefined}>
                <source src={viewModel.media_url} type="video/mp4" />
              </video>
            ) : (
              <img src={viewModel.imageUrl} alt="Instagram post" />
            )}
          </div>
        )}

        <div className="instagram-caption-section">
          {viewModel.displayCaption && (
            <p className="instagram-caption">{viewModel.displayCaption}</p>
          )}

          <div className="instagram-stats">
            <span>{formatInstagramMetric(viewModel.like_count)} likes</span>
            <span>{formatInstagramMetric(viewModel.comment_count)} comments</span>
            {viewModel.view_count && (
              <span>{formatInstagramMetric(viewModel.view_count)} views</span>
            )}
            {viewModel.media_type && (
              <span className="media-type-badge">{viewModel.media_type}</span>
            )}
          </div>
        </div>
      </div>

      <div className="lead-footer">
        <small>Posted: {viewModel.postedAtLabel}</small>
        <small>Collected: {viewModel.collectedAtLabel}</small>
      </div>
    </div>
  );
}
