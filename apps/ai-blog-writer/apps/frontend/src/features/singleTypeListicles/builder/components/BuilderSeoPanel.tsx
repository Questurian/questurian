import type { Dispatch, SetStateAction } from 'react'
import type { SingleTypeListicleDraft } from '../../types'
import type { SeoAiTarget } from '../services/seo-ai.service'

type BuilderSeoPanelProps = {
  draft: SingleTypeListicleDraft
  setDraft: Dispatch<SetStateAction<SingleTypeListicleDraft | null>>
  onGenerateSeoWithAi: (target?: SeoAiTarget) => Promise<void>
  isGeneratingSeoTarget: SeoAiTarget | null
  onGenerateSeoImageFromFeatured: () => Promise<void>
  isGeneratingSeoImage: boolean
}

export function BuilderSeoPanel({
  draft,
  setDraft,
  onGenerateSeoWithAi,
  isGeneratingSeoTarget,
  onGenerateSeoImageFromFeatured,
  isGeneratingSeoImage,
}: BuilderSeoPanelProps) {
  const updateSeo = (updater: (current: SingleTypeListicleDraft['seoSection']) => SingleTypeListicleDraft['seoSection']) => {
    setDraft((current) => {
      if (!current) return current
      return {
        ...current,
        seoSection: updater(current.seoSection),
      }
    })
  }

  const isGeneratingAny = Boolean(isGeneratingSeoTarget)
  const isSeoActionRunning = isGeneratingAny || isGeneratingSeoImage
  const renderAiButton = (target: SeoAiTarget, label = 'AI') => (
    <button
      type="button"
      className="stl-btn stl-btn-secondary stl-seo-ai-btn"
      onClick={() => void onGenerateSeoWithAi(target)}
      disabled={isSeoActionRunning}
    >
      {isGeneratingSeoTarget === target ? 'Generating...' : label}
    </button>
  )

  return (
    <section className="stl-panel stl-seo-panel">
      <div className="stl-panel-header">
        <h2>
          <span className="stl-kicker">Step 4</span> SEO & Metadata
        </h2>
        <div className="stl-inline-actions">
          <button
            type="button"
            className="stl-btn stl-btn-secondary"
            onClick={() => void onGenerateSeoWithAi('all')}
            disabled={isSeoActionRunning}
          >
            {isGeneratingSeoTarget === 'all' ? 'Generating...' : 'Generate SEO (AI)'}
          </button>
        </div>
      </div>

      <div className="stl-seo-stack">
        <label className="stl-field">
          <span>SEO Title *</span>
          <div className="stl-seo-input-wrap">
            <input
              className="stl-seo-input-with-ai"
              maxLength={60}
              value={draft.seoSection.seoTitle}
              onChange={(event) =>
                updateSeo((current) => ({
                  ...current,
                  seoTitle: event.target.value,
                }))
              }
            />
            <span className="stl-seo-ai-trigger-wrap">{renderAiButton('seoTitle')}</span>
          </div>
        </label>

        <label className="stl-field">
          <span>Meta Description *</span>
          <div className="stl-seo-input-wrap stl-seo-input-wrap-textarea">
            <textarea
              className="stl-seo-input-with-ai"
              rows={3}
              maxLength={160}
              value={draft.seoSection.metaDescription}
              onChange={(event) =>
                updateSeo((current) => ({
                  ...current,
                  metaDescription: event.target.value,
                }))
              }
            />
            <span className="stl-seo-ai-trigger-wrap">{renderAiButton('metaDescription')}</span>
          </div>
        </label>

        <section className="stl-seo-group stl-seo-group-og">
          <div className="stl-seo-group-header">
            <div className="stl-seo-group-copy">
              <h3>Open Graph Tags</h3>
              <p>Social sharing metadata for Facebook and other platforms.</p>
            </div>
            {renderAiButton('openGraph', 'AI Fill Section')}
          </div>

          <label className="stl-field">
            <span>og:title</span>
            <div className="stl-seo-input-wrap stl-seo-input-wrap-featured">
              <input
                className="stl-seo-input-with-ai"
                value={draft.seoSection.openGraph.title}
                onChange={(event) =>
                  updateSeo((current) => ({
                    ...current,
                    openGraph: {
                      ...current.openGraph,
                      title: event.target.value,
                    },
                  }))
                }
              />
              <span className="stl-seo-ai-trigger-wrap">{renderAiButton('openGraphTitle')}</span>
            </div>
          </label>

          <label className="stl-field">
            <span>og:description</span>
            <div className="stl-seo-input-wrap stl-seo-input-wrap-textarea">
              <textarea
                className="stl-seo-input-with-ai"
                rows={3}
                value={draft.seoSection.openGraph.description}
                onChange={(event) =>
                  updateSeo((current) => ({
                    ...current,
                    openGraph: {
                      ...current.openGraph,
                      description: event.target.value,
                    },
                  }))
                }
              />
              <span className="stl-seo-ai-trigger-wrap">{renderAiButton('openGraphDescription')}</span>
            </div>
          </label>

          <label className="stl-field">
            <span>og:image</span>
            <div className="stl-seo-input-wrap">
              <input
                className="stl-seo-input-with-ai"
                placeholder="https://example.com/image.jpg"
                value={draft.seoSection.openGraph.imageUrl}
                onChange={(event) =>
                  updateSeo((current) => ({
                    ...current,
                    openGraph: {
                      ...current.openGraph,
                      imageUrl: event.target.value,
                    },
                  }))
                }
              />
              <span className="stl-seo-ai-trigger-wrap">
                <button
                  type="button"
                  className="stl-btn stl-btn-secondary stl-seo-ai-btn"
                  onClick={() => void onGenerateSeoImageFromFeatured()}
                  disabled={isSeoActionRunning}
                >
                  {isGeneratingSeoImage ? 'Generating...' : 'Use Featured 1200x630'}
                </button>
              </span>
            </div>
          </label>

          <label className="stl-field">
            <span>og:url</span>
            <div className="stl-seo-input-wrap">
              <input
                className="stl-seo-input-with-ai"
                value={draft.seoSection.openGraph.url}
                onChange={(event) =>
                  updateSeo((current) => ({
                    ...current,
                    openGraph: {
                      ...current.openGraph,
                      url: event.target.value,
                    },
                  }))
                }
              />
              <span className="stl-seo-ai-trigger-wrap">{renderAiButton('openGraphUrl')}</span>
            </div>
          </label>
        </section>

        <section className="stl-seo-group stl-seo-group-twitter">
          <div className="stl-seo-group-header">
            <div className="stl-seo-group-copy">
              <h3>Twitter Card Tags</h3>
              <p>Share card metadata specifically for X/Twitter previews.</p>
            </div>
            {renderAiButton('twitterCard', 'AI Fill Section')}
          </div>

          <label className="stl-field">
            <span>twitter:card</span>
            <div className="stl-seo-input-wrap">
              <select
                className="stl-seo-input-with-ai"
                value={draft.seoSection.twitterCard.card}
                onChange={(event) =>
                  updateSeo((current) => ({
                    ...current,
                    twitterCard: {
                      ...current.twitterCard,
                      card: event.target.value as 'summary' | 'summary_large_image',
                    },
                  }))
                }
              >
                <option value="summary">summary</option>
                <option value="summary_large_image">summary_large_image</option>
              </select>
              <span className="stl-seo-ai-trigger-wrap">{renderAiButton('twitterCardCard')}</span>
            </div>
          </label>

          <label className="stl-field">
            <span>twitter:title</span>
            <div className="stl-seo-input-wrap">
              <input
                className="stl-seo-input-with-ai"
                value={draft.seoSection.twitterCard.title}
                onChange={(event) =>
                  updateSeo((current) => ({
                    ...current,
                    twitterCard: {
                      ...current.twitterCard,
                      title: event.target.value,
                    },
                  }))
                }
              />
              <span className="stl-seo-ai-trigger-wrap">{renderAiButton('twitterCardTitle')}</span>
            </div>
          </label>

          <label className="stl-field">
            <span>twitter:description</span>
            <div className="stl-seo-input-wrap stl-seo-input-wrap-textarea">
              <textarea
                className="stl-seo-input-with-ai"
                rows={3}
                value={draft.seoSection.twitterCard.description}
                onChange={(event) =>
                  updateSeo((current) => ({
                    ...current,
                    twitterCard: {
                      ...current.twitterCard,
                      description: event.target.value,
                    },
                  }))
                }
              />
              <span className="stl-seo-ai-trigger-wrap">{renderAiButton('twitterCardDescription')}</span>
            </div>
          </label>

          <label className="stl-field">
            <span>twitter:image</span>
            <input
              placeholder="https://example.com/twitter-image.jpg"
              value={draft.seoSection.twitterCard.imageUrl}
              onChange={(event) =>
                updateSeo((current) => ({
                  ...current,
                  twitterCard: {
                    ...current.twitterCard,
                    imageUrl: event.target.value,
                  },
                }))
              }
            />
          </label>
        </section>

        <section className="stl-seo-group">
          <div className="stl-seo-group-header">
            <div className="stl-seo-group-copy">
              <h3>Structured Data</h3>
              <p>JSON-LD object to help search engines classify this page.</p>
              {!draft.seoSection.openGraph.url.trim() ? (
                <p className="stl-legacy-note">
                  Slug-based URL generation is pending; schema URL fields are intentionally omitted for now.
                </p>
              ) : null}
            </div>
            {renderAiButton('structuredData')}
          </div>

          <label className="stl-field">
            <span>Structured Data (JSON-LD)</span>
            <div className="stl-seo-input-wrap stl-seo-input-wrap-textarea">
              <textarea
                className="stl-seo-input-with-ai"
                rows={6}
                placeholder='{"@context":"https://schema.org","@type":"Article"}'
                value={draft.seoSection.structuredData}
                onChange={(event) =>
                  updateSeo((current) => ({
                    ...current,
                    structuredData: event.target.value,
                  }))
                }
              />
              <span className="stl-seo-ai-trigger-wrap">{renderAiButton('structuredData')}</span>
            </div>
          </label>
        </section>

        <section className="stl-seo-group">
          <div className="stl-seo-group-header">
            <div className="stl-seo-group-copy">
              <h3>Robots Meta Tag</h3>
              <p>Control indexing and crawling behavior for this article.</p>
            </div>
            {renderAiButton('robots', 'AI Fill Section')}
          </div>

          <label className="stl-field">
            <span>index</span>
            <div className="stl-seo-input-wrap">
              <select
                className="stl-seo-input-with-ai"
                value={draft.seoSection.robots.index}
                onChange={(event) =>
                  updateSeo((current) => ({
                    ...current,
                    robots: {
                      ...current.robots,
                      index: event.target.value as 'index' | 'noindex',
                    },
                  }))
                }
              >
                <option value="index">index</option>
                <option value="noindex">noindex</option>
              </select>
              <span className="stl-seo-ai-trigger-wrap">{renderAiButton('robotsIndex')}</span>
            </div>
          </label>

          <label className="stl-field">
            <span>follow</span>
            <div className="stl-seo-input-wrap">
              <select
                className="stl-seo-input-with-ai"
                value={draft.seoSection.robots.follow}
                onChange={(event) =>
                  updateSeo((current) => ({
                    ...current,
                    robots: {
                      ...current.robots,
                      follow: event.target.value as 'follow' | 'nofollow',
                    },
                  }))
                }
              >
                <option value="follow">follow</option>
                <option value="nofollow">nofollow</option>
              </select>
              <span className="stl-seo-ai-trigger-wrap">{renderAiButton('robotsFollow')}</span>
            </div>
          </label>
        </section>
      </div>
    </section>
  )
}
