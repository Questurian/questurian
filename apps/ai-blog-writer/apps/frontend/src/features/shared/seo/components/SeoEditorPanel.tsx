import { useState, type Dispatch, type SetStateAction } from 'react'
import type { SeoSection } from '../types'
import type { SeoAiTarget } from '../services/seo-ai.service'
import { OgImageCropUploadModal } from './OgImageCropUploadModal'

const resolveSocialPreviewUrl = (url: string): string | null => {
  const trimmed = url.trim()
  if (!trimmed) return null

  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return parsed.toString()
  } catch {
    return null
  }
}

type SeoEditorPanelProps = {
  seoSection: SeoSection
  setSeoSection: Dispatch<SetStateAction<SeoSection>>
  onGenerateSeoWithAi: (target?: SeoAiTarget) => Promise<void>
  isGeneratingSeoTarget: SeoAiTarget | null
  onGenerateSeoImageFromFeatured: () => Promise<void>
  isGeneratingSeoImage: boolean
  onUploadOgImageFile: (file: File) => Promise<void>
  isUploadingOgImage: boolean
  stepLabel?: string
  title?: string
}

export function SeoEditorPanel({
  seoSection,
  setSeoSection,
  onGenerateSeoWithAi,
  isGeneratingSeoTarget,
  onGenerateSeoImageFromFeatured,
  isGeneratingSeoImage,
  onUploadOgImageFile,
  isUploadingOgImage,
  stepLabel = 'Step 4',
  title = 'SEO & Metadata',
}: SeoEditorPanelProps) {
  const [isOgUploadModalOpen, setIsOgUploadModalOpen] = useState(false)
  const ogImagePreviewUrl = resolveSocialPreviewUrl(seoSection.openGraph.imageUrl)
  const twitterImagePreviewUrl = resolveSocialPreviewUrl(seoSection.twitterCard.imageUrl)

  const updateSeo = (updater: (current: SeoSection) => SeoSection) => {
    setSeoSection((current) => updater(current))
  }

  const isGeneratingAny = Boolean(isGeneratingSeoTarget)
  const isSeoActionRunning = isGeneratingAny || isGeneratingSeoImage || isUploadingOgImage

  const openOgUploadModal = () => {
    if (isSeoActionRunning) return
    setIsOgUploadModalOpen(true)
  }

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
    <>
      <section className="stl-panel stl-seo-panel">
        <div className="stl-panel-header">
          <h2>
            <span className="stl-kicker">{stepLabel}</span> {title}
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
                value={seoSection.seoTitle}
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
                value={seoSection.metaDescription}
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
                  value={seoSection.openGraph.title}
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
                  value={seoSection.openGraph.description}
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
              <div className="stl-seo-input-wrap stl-seo-input-wrap-social-image">
                <input
                  className="stl-seo-input-with-ai"
                  placeholder="https://example.com/image.jpg"
                  value={seoSection.openGraph.imageUrl}
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
                  <span className="stl-seo-image-actions">
                    <button
                      type="button"
                      className="stl-btn stl-btn-secondary stl-seo-ai-btn"
                      onClick={openOgUploadModal}
                      disabled={isSeoActionRunning}
                    >
                      {isUploadingOgImage ? 'Uploading...' : 'Upload 1200x630'}
                    </button>
                    <button
                      type="button"
                      className="stl-btn stl-btn-secondary stl-seo-ai-btn"
                      onClick={() => void onGenerateSeoImageFromFeatured()}
                      disabled={isSeoActionRunning}
                    >
                      {isGeneratingSeoImage ? 'Generating...' : 'Use Featured 1200x630'}
                    </button>
                  </span>
                </span>
              </div>
              <p className="stl-legacy-note stl-seo-og-hint">
                Thumb-stopper upload opens a manual crop editor and exports exactly 1200x630.
              </p>
              {ogImagePreviewUrl ? (
                <div className="stl-seo-social-preview">
                  <div className="stl-seo-social-preview__header">
                    <p className="stl-seo-social-preview__label">Open Graph Preview</p>
                    <a
                      className="stl-seo-social-preview__link"
                      href={ogImagePreviewUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open image
                    </a>
                  </div>
                  <a
                    className="stl-seo-social-preview__media"
                    href={ogImagePreviewUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <img src={ogImagePreviewUrl} alt="Open Graph social image preview" />
                  </a>
                </div>
              ) : null}
            </label>

            <label className="stl-field">
              <span>og:url</span>
              <div className="stl-seo-input-wrap">
                <input
                  className="stl-seo-input-with-ai"
                  placeholder="fix-this-url-after-frontend-urls-are-set"
                  value={seoSection.openGraph.url}
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
              <p className="stl-legacy-note">
                Placeholder only. Leave this blank until the real frontend article URL exists.
              </p>
            </label>
          </section>

          <section className="stl-seo-group stl-seo-group-twitter">
            <div className="stl-seo-group-header">
              <div className="stl-seo-group-copy">
                <h3>Twitter Card Tags</h3>
                <p>Preview metadata tuned for X/Twitter sharing.</p>
              </div>
              {renderAiButton('twitterCard', 'AI Fill Section')}
            </div>

            <label className="stl-field">
              <span>twitter:card</span>
              <div className="stl-seo-input-wrap">
                <select
                  className="stl-seo-input-with-ai"
                  value={seoSection.twitterCard.card}
                  onChange={(event) =>
                    updateSeo((current) => ({
                      ...current,
                      twitterCard: {
                        ...current.twitterCard,
                        card: event.target.value === 'summary_large_image' ? 'summary_large_image' : 'summary',
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
                  value={seoSection.twitterCard.title}
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
                  value={seoSection.twitterCard.description}
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
                className="stl-seo-input-with-ai"
                placeholder="https://example.com/image.jpg"
                value={seoSection.twitterCard.imageUrl}
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
              {twitterImagePreviewUrl ? (
                <div className="stl-seo-social-preview">
                  <div className="stl-seo-social-preview__header">
                    <p className="stl-seo-social-preview__label">Twitter Image Preview</p>
                    <a
                      className="stl-seo-social-preview__link"
                      href={twitterImagePreviewUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open image
                    </a>
                  </div>
                  <a
                    className="stl-seo-social-preview__media"
                    href={twitterImagePreviewUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <img src={twitterImagePreviewUrl} alt="Twitter social image preview" />
                  </a>
                </div>
              ) : null}
            </label>
          </section>

          <section className="stl-seo-group">
            <div className="stl-seo-group-header">
              <div className="stl-seo-group-copy">
                <h3>Structured Data</h3>
                <p>JSON-LD for article schema markup.</p>
              </div>
              {!seoSection.openGraph.url.trim() ? (
                <p className="stl-legacy-note">Set `og:url` before finalizing structured data.</p>
              ) : renderAiButton('structuredData', 'AI Refine')}
            </div>

            <label className="stl-field">
              <span>JSON-LD</span>
              <div className="stl-seo-input-wrap stl-seo-input-wrap-textarea">
                <textarea
                  className="stl-seo-input-with-ai"
                  rows={12}
                  value={seoSection.structuredData}
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
                <h3>Robots</h3>
                <p>Indexing controls for search crawlers.</p>
              </div>
              {renderAiButton('robots', 'AI Fill Section')}
            </div>

            <label className="stl-field">
              <span>robots:index</span>
              <div className="stl-seo-input-wrap">
                <select
                  className="stl-seo-input-with-ai"
                  value={seoSection.robots.index}
                  onChange={(event) =>
                    updateSeo((current) => ({
                      ...current,
                      robots: {
                        ...current.robots,
                        index: event.target.value === 'noindex' ? 'noindex' : 'index',
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
              <span>robots:follow</span>
              <div className="stl-seo-input-wrap">
                <select
                  className="stl-seo-input-with-ai"
                  value={seoSection.robots.follow}
                  onChange={(event) =>
                    updateSeo((current) => ({
                      ...current,
                      robots: {
                        ...current.robots,
                        follow: event.target.value === 'nofollow' ? 'nofollow' : 'follow',
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

      <OgImageCropUploadModal
        isOpen={isOgUploadModalOpen}
        isUploading={isUploadingOgImage}
        onUploadCroppedFile={onUploadOgImageFile}
        onClose={() => setIsOgUploadModalOpen(false)}
      />
    </>
  )
}
