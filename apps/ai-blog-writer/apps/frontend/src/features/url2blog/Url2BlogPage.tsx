import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { extractArticle, type ExtractResponse } from './api'
import './styles.css'

type WizardStep = 'input' | 'processing' | 'complete'

export default function Url2BlogPage() {
  const [url, setUrl] = useState('')
  const [response, setResponse] = useState<ExtractResponse | null>(null)
  const [showRaw, setShowRaw] = useState(false)
  const [showOriginal, setShowOriginal] = useState(false)

  const extractMutation = useMutation({
    mutationFn: extractArticle,
    onSuccess: (data) => {
      setResponse(data)
    },
  })

  const currentStep = useMemo((): WizardStep => {
    if (extractMutation.isPending) return 'processing'
    if (response) return 'complete'
    return 'input'
  }, [extractMutation.isPending, response])

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!url.trim()) return
    setResponse(null)
    setShowRaw(false)
    setShowOriginal(false)
    extractMutation.reset()
    extractMutation.mutate(url.trim())
  }

  const handleStartOver = () => {
    setUrl('')
    setResponse(null)
    setShowRaw(false)
    setShowOriginal(false)
    extractMutation.reset()
  }

  const handleCopyJson = () => {
    if (!response?.parsed) return
    const wasTranslated = !response.translation_skipped && response.translated != null
    const output = wasTranslated
      ? { ...response.translated, language: response.parsed.language }
      : response.parsed
    navigator.clipboard.writeText(JSON.stringify(output, null, 2))
  }

  return (
    <div className="url2blog-page">
      <header className="url2blog-hero">
        <div>
          <p className="url2blog-eyebrow">Questurian Studio</p>
          <h1>Turn any article into <span className="url2blog-underline-text">structured data</span><span className="url2blog-teal-dot">.</span></h1>
          <p className="url2blog-lede">
            Paste a URL and let AI extract the article title and content into clean JSON.
          </p>
        </div>
        <div className="url2blog-badge-row">
          <Link to="/" className="url2blog-nav-link">&larr; Home</Link>
        </div>
      </header>

      <main className="url2blog-wizard">
        {/* Step 1: URL Input */}
        {currentStep === 'input' && (
          <section className="url2blog-panel u2b-wizard-panel">
            <div className="url2blog-panel-header">
              <h2>Enter Article URL</h2>
              <p>Paste the URL of any web article. We'll fetch the page and use Gemini to extract the title and main content.</p>
            </div>
            <form className="url2blog-panel-body" onSubmit={handleSubmit}>
              <div className="url2blog-url-input">
                <label htmlFor="article-url">Article URL</label>
                <input
                  id="article-url"
                  type="url"
                  placeholder="https://example.com/article"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="url2blog-url-field"
                  autoFocus
                />
              </div>
              <div className="url2blog-button-row">
                <button
                  type="submit"
                  className="url2blog-submit-btn"
                  disabled={!url.trim() || extractMutation.isPending}
                >
                  Extract Article
                </button>
              </div>
              {extractMutation.isError ? (
                <p className="url2blog-error">
                  {extractMutation.error instanceof Error
                    ? extractMutation.error.message
                    : 'Extraction failed. Check the backend logs.'}
                </p>
              ) : null}
            </form>
          </section>
        )}

        {/* Step 2: Processing */}
        {currentStep === 'processing' && (
          <section className="url2blog-panel u2b-wizard-panel u2b-processing-panel">
            <div className="u2b-processing-content">
              <div className="u2b-pipeline-progress-centered">
                <h3>Pipeline Progress</h3>
                <div className="u2b-stage-checklist">
                  <div className="u2b-stage-item done">
                    <div className="u2b-stage-dot" />
                    <span>URL submitted</span>
                  </div>
                  <div className="u2b-stage-item running">
                    <div className="u2b-stage-dot" />
                    <span>Fetching &amp; extracting article</span>
                  </div>
                </div>
              </div>
              <p className="u2b-processing-message">Fetching page and extracting content with Gemini...</p>
            </div>
          </section>
        )}

        {/* Step 3: Results */}
        {currentStep === 'complete' && response && (
          <section className="url2blog-panel u2b-wizard-panel u2b-complete-panel">
            <div className="url2blog-panel-header">
              <div className="u2b-step-indicator u2b-complete-indicator">
                <span className="u2b-step-check">&check;</span>
                <span>Extraction Complete</span>
              </div>
              <h2>{(response.translated?.title || response.parsed?.title) || 'Extracted Article'}</h2>
              <p className="u2b-source-url">{response.source_url}</p>
            </div>
            <div className="url2blog-panel-body">
              {response.parse_error ? (
                <div className="url2blog-error">
                  <strong>Parse error:</strong> {response.parse_error}
                </div>
              ) : null}

              {response.parsed ? (() => {
                const wasTranslated = !response.translation_skipped && response.translated != null
                const displayTitle = wasTranslated ? response.translated!.title : response.parsed!.title
                const displayContent = wasTranslated ? response.translated!.content : response.parsed!.content

                return (
                  <div className="u2b-extracted-content">
                    <div className="u2b-meta-row">
                      <div className="u2b-language-badge">
                        {response.parsed.language}
                      </div>
                      {wasTranslated && (
                        <div className="u2b-translated-badge">
                          Translated to English
                        </div>
                      )}
                      {response.translation_skipped && (
                        <div className="u2b-skipped-badge">
                          Already in English
                        </div>
                      )}
                    </div>

                    {response.translation_error && (
                      <p className="url2blog-error">Translation error: {response.translation_error}</p>
                    )}

                    <div className="u2b-content-section">
                      <h3>Title</h3>
                      <p className="u2b-title-display">{displayTitle}</p>
                    </div>
                    <div className="u2b-content-section">
                      <h3>Content</h3>
                      <div className="u2b-article-text">
                        {displayContent}
                      </div>
                    </div>

                    {wasTranslated && (
                      <>
                        <div className="u2b-raw-toggle">
                          <button
                            type="button"
                            className="url2blog-toggle-btn"
                            onClick={() => setShowOriginal(!showOriginal)}
                          >
                            {showOriginal ? 'Hide' : 'Show'} Original ({response.parsed!.language})
                          </button>
                        </div>
                        {showOriginal && (
                          <div className="u2b-original-content">
                            <div className="u2b-content-section">
                              <h3>Original Title</h3>
                              <p className="u2b-title-display">{response.parsed!.title}</p>
                            </div>
                            <div className="u2b-content-section">
                              <h3>Original Content</h3>
                              <div className="u2b-article-text">
                                {response.parsed!.content}
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )
              })() : null}

              {/* Raw JSON toggle */}
              <div className="u2b-raw-toggle">
                <button
                  type="button"
                  className="url2blog-toggle-btn"
                  onClick={() => setShowRaw(!showRaw)}
                >
                  {showRaw ? 'Hide' : 'Show'} Raw JSON
                </button>
              </div>
              {showRaw && (
                <div className="u2b-raw-json">
                  <pre>{JSON.stringify(response.parsed, null, 2)}</pre>
                </div>
              )}

              <div className="url2blog-button-row">
                <button
                  type="button"
                  className="url2blog-submit-btn"
                  onClick={handleCopyJson}
                  disabled={!response.parsed}
                >
                  Copy JSON
                </button>
                <button
                  type="button"
                  className="url2blog-clear-btn"
                  onClick={handleStartOver}
                >
                  Start Over
                </button>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
