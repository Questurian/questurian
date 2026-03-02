import type { Dispatch, SetStateAction } from 'react'
import type { SingleTypeListicleDraft } from '../../types'

type BuilderSeoPanelProps = {
  draft: SingleTypeListicleDraft
  setDraft: Dispatch<SetStateAction<SingleTypeListicleDraft | null>>
  onGenerateSeoWithAi: () => Promise<void>
  isGeneratingSeo: boolean
}

export function BuilderSeoPanel({
  draft,
  setDraft,
  onGenerateSeoWithAi,
  isGeneratingSeo,
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
            onClick={() => void onGenerateSeoWithAi()}
            disabled={isGeneratingSeo}
          >
            {isGeneratingSeo ? 'Generating...' : 'Generate SEO (AI)'}
          </button>
        </div>
      </div>

      <div className="stl-seo-stack">
        <label className="stl-field">
          <span>SEO Title *</span>
          <input
            maxLength={60}
            value={draft.seoSection.seoTitle}
            onChange={(event) =>
              updateSeo((current) => ({
                ...current,
                seoTitle: event.target.value,
              }))
            }
          />
        </label>

        <label className="stl-field">
          <span>Meta Description *</span>
          <textarea
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
        </label>

        <section className="stl-seo-group stl-seo-group-og">
          <div className="stl-seo-group-header">
            <h3>Open Graph Tags</h3>
            <p>Social sharing metadata for Facebook and other platforms.</p>
          </div>

          <label className="stl-field">
            <span>og:title</span>
            <input
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
          </label>

          <label className="stl-field">
            <span>og:description</span>
            <textarea
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
          </label>

          <label className="stl-field">
            <span>og:image</span>
            <input
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
          </label>

          <label className="stl-field">
            <span>og:url</span>
            <input
              placeholder="https://example.com/article"
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
          </label>
        </section>

        <section className="stl-seo-group stl-seo-group-twitter">
          <div className="stl-seo-group-header">
            <h3>Twitter Card Tags</h3>
            <p>Share card metadata specifically for X/Twitter previews.</p>
          </div>

          <label className="stl-field">
            <span>twitter:card</span>
            <select
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
          </label>

          <label className="stl-field">
            <span>twitter:title</span>
            <input
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
          </label>

          <label className="stl-field">
            <span>twitter:description</span>
            <textarea
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
            <h3>Structured Data</h3>
            <p>Optional JSON-LD object to help search engines classify this page.</p>
          </div>

          <label className="stl-field">
            <span>Structured Data (JSON-LD)</span>
            <textarea
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
          </label>
        </section>

        <section className="stl-seo-group">
          <div className="stl-seo-group-header">
            <h3>Robots Meta Tag</h3>
            <p>Control indexing and crawling behavior for this article.</p>
          </div>

          <label className="stl-field">
            <span>index</span>
            <select
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
          </label>

          <label className="stl-field">
            <span>follow</span>
            <select
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
          </label>
        </section>
      </div>
    </section>
  )
}
