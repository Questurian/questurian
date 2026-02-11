import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { synthesizeSources } from './api'
import './styles.css'

interface LocationFields {
  country: string
  city: string
  neighborhood: string
}

interface VoiceFields {
  publication_style_reference: string
  tone: string
  brand_identity: string
}

interface FormattingFields {
  paragraph_length: string
  target_word_count: number
}

interface SeoFields {
  primary_keyword: string
  secondary_keywords: string
}

interface RawBlob {
  id: number
  content: string
}

interface P2BFormState {
  location: LocationFields
  topic: string
  audience: string
  goal: string
  perspective: string
  voice: VoiceFields
  formatting: FormattingFields
  callToAction: string
  seo: SeoFields
  editorialInstructions: string
  blobs: RawBlob[]
}

const STORAGE_KEY = 'p2b-form-draft'

const DEFAULT_STATE: P2BFormState = {
  location: { country: '', city: '', neighborhood: '' },
  topic: '',
  audience: '',
  goal: '',
  perspective: '',
  voice: { publication_style_reference: '', tone: '', brand_identity: '' },
  formatting: { paragraph_length: 'Medium (3–5 sentences per paragraph)', target_word_count: 500 },
  callToAction: '',
  seo: { primary_keyword: '', secondary_keywords: '' },
  editorialInstructions: '',
  blobs: [{ id: 1, content: '' }],
}

function loadSavedState(): P2BFormState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_STATE
    const parsed = JSON.parse(raw) as Partial<P2BFormState>
    return { ...DEFAULT_STATE, ...parsed }
  } catch {
    return DEFAULT_STATE
  }
}

export default function Prompt2BlogPage() {
  const saved = useRef(loadSavedState())

  const [location, setLocation] = useState<LocationFields>(saved.current.location)
  const [topic, setTopic] = useState(saved.current.topic)
  const [audience, setAudience] = useState(saved.current.audience)
  const [goal, setGoal] = useState(saved.current.goal)
  const [perspective, setPerspective] = useState(saved.current.perspective)
  const [voice, setVoice] = useState<VoiceFields>(saved.current.voice)
  const [formatting, setFormatting] = useState<FormattingFields>(saved.current.formatting)
  const [callToAction, setCallToAction] = useState(saved.current.callToAction)
  const [seo, setSeo] = useState<SeoFields>(saved.current.seo)
  const [editorialInstructions, setEditorialInstructions] = useState(saved.current.editorialInstructions)
  const [blobs, setBlobs] = useState<RawBlob[]>(saved.current.blobs)

  // Persist to localStorage on every change
  useEffect(() => {
    const state: P2BFormState = {
      location, topic, audience, goal, perspective,
      voice, formatting, callToAction, seo, editorialInstructions, blobs,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [location, topic, audience, goal, perspective, voice, formatting, callToAction, seo, editorialInstructions, blobs])

  const addBlob = () => {
    setBlobs(prev => [...prev, { id: Date.now(), content: '' }])
  }

  const removeBlob = (id: number) => {
    if (blobs.length <= 1) return
    setBlobs(prev => prev.filter(b => b.id !== id))
  }

  const updateBlob = (id: number, content: string) => {
    setBlobs(prev => prev.map(b => b.id === id ? { ...b, content } : b))
  }

  const handleClear = useCallback(() => {
    setLocation(DEFAULT_STATE.location)
    setTopic(DEFAULT_STATE.topic)
    setAudience(DEFAULT_STATE.audience)
    setGoal(DEFAULT_STATE.goal)
    setPerspective(DEFAULT_STATE.perspective)
    setVoice(DEFAULT_STATE.voice)
    setFormatting(DEFAULT_STATE.formatting)
    setCallToAction(DEFAULT_STATE.callToAction)
    setSeo(DEFAULT_STATE.seo)
    setEditorialInstructions(DEFAULT_STATE.editorialInstructions)
    setBlobs(DEFAULT_STATE.blobs)
    localStorage.removeItem(STORAGE_KEY)
  }, [])

  const [synthesizedText, setSynthesizedText] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasBlobs = blobs.some(b => b.content.trim())

  const handleSynthesize = useCallback(async () => {
    const contents = blobs.map(b => b.content).filter(c => c.trim())
    if (contents.length === 0) return

    setIsLoading(true)
    setError(null)
    try {
      const res = await synthesizeSources(contents)
      setSynthesizedText(res.synthesized)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Synthesis failed')
    } finally {
      setIsLoading(false)
    }
  }, [blobs])

  const handleEditSources = useCallback(() => {
    setSynthesizedText(null)
    setError(null)
  }, [])

  const [copied, setCopied] = useState(false)

  const buildJson = useMemo(() => ({
    location: {
      country: location.country || null,
      city: location.city || null,
      neighborhood: location.neighborhood || null,
    },
    topic: topic || null,
    audience: audience || null,
    goal: goal || null,
    perspective: perspective || null,
    voice: {
      publication_style_reference: voice.publication_style_reference || null,
      tone: voice.tone || null,
      brand_identity: voice.brand_identity || null,
    },
    formatting: {
      paragraph_length: formatting.paragraph_length,
      target_word_count: formatting.target_word_count,
    },
    call_to_action: callToAction || null,
    seo: {
      primary_keyword: seo.primary_keyword || null,
      secondary_keywords: seo.secondary_keywords
        ? seo.secondary_keywords.split(',').map(k => k.trim()).filter(Boolean)
        : [],
    },
    editorial_instructions: editorialInstructions || null,
    raw_input: {
      blobs: blobs
        .filter(b => b.content.trim())
        .map(b => ({ content: b.content })),
    },
  }), [location, topic, audience, goal, perspective, voice, formatting, callToAction, seo, editorialInstructions, blobs])

  const handleCopyJson = useCallback(() => {
    navigator.clipboard.writeText(JSON.stringify(buildJson, null, 2)).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [buildJson])

  return (
    <div className="p2b-page">
      <header className="p2b-hero">
        <div>
          <p className="p2b-eyebrow">Questurian Studio</p>
          <h1>Craft articles from a <span className="p2b-underline-text">prompt</span><span className="p2b-dot">.</span></h1>
          <p className="p2b-lede">
            Fill out content parameters and let AI generate polished, publish-ready articles from your raw material.
          </p>
        </div>
        <div className="p2b-badge-row">
          <Link to="/" className="p2b-nav-link">&larr; Home</Link>
        </div>
      </header>

      <main className="p2b-form-container">
        <form className="p2b-form" onSubmit={(e) => e.preventDefault()}>

          {/* Location */}
          <section className="p2b-panel">
            <div className="p2b-panel-header">
              <h2>Location</h2>
              <p>Where is this article set? City and neighborhood are optional.</p>
            </div>
            <div className="p2b-panel-body">
              <div className="p2b-field-row p2b-field-row--3">
                <div className="p2b-field">
                  <label htmlFor="p2b-country">Country</label>
                  <input
                    id="p2b-country"
                    type="text"
                    placeholder="e.g., Japan"
                    value={location.country}
                    onChange={(e) => setLocation(prev => ({ ...prev, country: e.target.value }))}
                    className="p2b-input"
                  />
                </div>
                <div className="p2b-field">
                  <label htmlFor="p2b-city">City</label>
                  <input
                    id="p2b-city"
                    type="text"
                    placeholder="e.g., Tokyo"
                    value={location.city}
                    onChange={(e) => setLocation(prev => ({ ...prev, city: e.target.value }))}
                    className="p2b-input"
                  />
                </div>
                <div className="p2b-field">
                  <label htmlFor="p2b-neighborhood">Neighborhood</label>
                  <input
                    id="p2b-neighborhood"
                    type="text"
                    placeholder="e.g., Shibuya"
                    value={location.neighborhood}
                    onChange={(e) => setLocation(prev => ({ ...prev, neighborhood: e.target.value }))}
                    className="p2b-input"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Topic & Audience */}
          <section className="p2b-panel">
            <div className="p2b-panel-header">
              <h2>Topic & Audience</h2>
              <p>Define what the article is about and who it's for.</p>
            </div>
            <div className="p2b-panel-body">
              <div className="p2b-field">
                <label htmlFor="p2b-topic">Topic</label>
                <input
                  id="p2b-topic"
                  type="text"
                  placeholder="e.g., Japan Expands Visa-Free Travel to Additional Countries"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="p2b-input"
                />
              </div>
              <div className="p2b-field">
                <label htmlFor="p2b-audience">Audience</label>
                <input
                  id="p2b-audience"
                  type="text"
                  placeholder="e.g., International travelers, frequent flyers, digital nomads"
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  className="p2b-input"
                />
              </div>
              <div className="p2b-field">
                <label htmlFor="p2b-goal">Goal</label>
                <textarea
                  id="p2b-goal"
                  placeholder="e.g., Inform readers about Japan's updated visa-free travel policy and its impact on tourism"
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  rows={2}
                  className="p2b-textarea"
                />
              </div>
              <div className="p2b-field">
                <label htmlFor="p2b-perspective">Perspective</label>
                <input
                  id="p2b-perspective"
                  type="text"
                  placeholder="e.g., Travel journalist reporting on official policy changes"
                  value={perspective}
                  onChange={(e) => setPerspective(e.target.value)}
                  className="p2b-input"
                />
              </div>
            </div>
          </section>

          {/* Voice */}
          <section className="p2b-panel">
            <div className="p2b-panel-header">
              <h2>Voice & Tone</h2>
              <p>Set the style, tone, and brand identity for the article.</p>
            </div>
            <div className="p2b-panel-body">
              <div className="p2b-field">
                <label htmlFor="p2b-style-ref">Publication Style Reference</label>
                <input
                  id="p2b-style-ref"
                  type="text"
                  placeholder="e.g., High-end global travel journalism with cultural context"
                  value={voice.publication_style_reference}
                  onChange={(e) => setVoice(prev => ({ ...prev, publication_style_reference: e.target.value }))}
                  className="p2b-input"
                />
              </div>
              <div className="p2b-field">
                <label htmlFor="p2b-tone">Tone</label>
                <input
                  id="p2b-tone"
                  type="text"
                  placeholder="e.g., Informative, polished, globally minded, optimistic"
                  value={voice.tone}
                  onChange={(e) => setVoice(prev => ({ ...prev, tone: e.target.value }))}
                  className="p2b-input"
                />
              </div>
              <div className="p2b-field">
                <label htmlFor="p2b-brand">Brand Identity</label>
                <input
                  id="p2b-brand"
                  type="text"
                  placeholder="e.g., Premium travel publication with authority, clarity, and global perspective"
                  value={voice.brand_identity}
                  onChange={(e) => setVoice(prev => ({ ...prev, brand_identity: e.target.value }))}
                  className="p2b-input"
                />
              </div>
            </div>
          </section>

          {/* Formatting */}
          <section className="p2b-panel">
            <div className="p2b-panel-header">
              <h2>Formatting</h2>
              <p>Control paragraph length and target word count.</p>
            </div>
            <div className="p2b-panel-body">
              <div className="p2b-field-row p2b-field-row--2">
                <div className="p2b-field">
                  <label htmlFor="p2b-para-length">Paragraph Length</label>
                  <select
                    id="p2b-para-length"
                    value={formatting.paragraph_length}
                    onChange={(e) => setFormatting(prev => ({ ...prev, paragraph_length: e.target.value }))}
                    className="p2b-select"
                  >
                    <option value="Short (1–2 sentences per paragraph)">Short (1-2 sentences)</option>
                    <option value="Medium (3–5 sentences per paragraph)">Medium (3-5 sentences)</option>
                    <option value="Long (5–8 sentences per paragraph)">Long (5-8 sentences)</option>
                  </select>
                </div>
                <div className="p2b-field">
                  <label htmlFor="p2b-word-count">Target Word Count</label>
                  <input
                    id="p2b-word-count"
                    type="number"
                    min={100}
                    max={5000}
                    step={50}
                    value={formatting.target_word_count}
                    onChange={(e) => setFormatting(prev => ({ ...prev, target_word_count: Number(e.target.value) }))}
                    className="p2b-input"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* SEO */}
          <section className="p2b-panel">
            <div className="p2b-panel-header">
              <h2>SEO</h2>
              <p>Optimize the article for search engines.</p>
            </div>
            <div className="p2b-panel-body">
              <div className="p2b-field">
                <label htmlFor="p2b-primary-kw">Primary Keyword</label>
                <input
                  id="p2b-primary-kw"
                  type="text"
                  placeholder="e.g., Japan visa-free travel update"
                  value={seo.primary_keyword}
                  onChange={(e) => setSeo(prev => ({ ...prev, primary_keyword: e.target.value }))}
                  className="p2b-input"
                />
              </div>
              <div className="p2b-field">
                <label htmlFor="p2b-secondary-kws">Secondary Keywords</label>
                <input
                  id="p2b-secondary-kws"
                  type="text"
                  placeholder="Comma-separated, e.g., Japan travel policy, visa-free entry Japan"
                  value={seo.secondary_keywords}
                  onChange={(e) => setSeo(prev => ({ ...prev, secondary_keywords: e.target.value }))}
                  className="p2b-input"
                />
              </div>
            </div>
          </section>

          {/* Call to Action & Editorial Instructions */}
          <section className="p2b-panel">
            <div className="p2b-panel-header">
              <h2>Editorial</h2>
              <p>Provide a call to action and any editorial instructions for the AI.</p>
            </div>
            <div className="p2b-panel-body">
              <div className="p2b-field">
                <label htmlFor="p2b-cta">Call to Action</label>
                <textarea
                  id="p2b-cta"
                  placeholder="e.g., Encourage readers to monitor official announcements and begin planning future trips"
                  value={callToAction}
                  onChange={(e) => setCallToAction(e.target.value)}
                  rows={2}
                  className="p2b-textarea"
                />
              </div>
              <div className="p2b-field">
                <label htmlFor="p2b-editorial">Editorial Instructions</label>
                <textarea
                  id="p2b-editorial"
                  placeholder="e.g., Synthesize the raw source material into a coherent, professionally written article. Ignore formatting artifacts..."
                  value={editorialInstructions}
                  onChange={(e) => setEditorialInstructions(e.target.value)}
                  rows={3}
                  className="p2b-textarea"
                />
              </div>
            </div>
          </section>

          {/* Raw Input Blobs / Synthesized Result */}
          <section className="p2b-panel">
            {synthesizedText === null ? (
              <>
                <div className="p2b-panel-header">
                  <h2>Raw Source Material</h2>
                  <p>Paste raw text blobs — articles, social posts, notes, HTML — the AI will synthesize them.</p>
                </div>
                <div className="p2b-panel-body">
                  {blobs.map((blob, index) => (
                    <div key={blob.id} className="p2b-blob-field">
                      <div className="p2b-blob-header">
                        <label>Source {index + 1}</label>
                        {blobs.length > 1 && (
                          <button
                            type="button"
                            className="p2b-blob-remove"
                            onClick={() => removeBlob(blob.id)}
                            aria-label="Remove source"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </button>
                        )}
                      </div>
                      <textarea
                        placeholder="Paste raw text, article excerpt, social media post, HTML, notes..."
                        value={blob.content}
                        onChange={(e) => updateBlob(blob.id, e.target.value)}
                        rows={4}
                        className="p2b-textarea"
                      />
                    </div>
                  ))}
                  <button type="button" className="p2b-add-blob-btn" onClick={addBlob}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Add Another Source
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="p2b-panel-header">
                  <h2>Synthesized Overview</h2>
                  <p>AI-generated synthesis of your {blobs.filter(b => b.content.trim()).length} source(s).</p>
                </div>
                <div className="p2b-panel-body">
                  <div className="p2b-synthesized-text">
                    {synthesizedText.split('\n').map((line, i) => (
                      <p key={i}>{line || '\u00A0'}</p>
                    ))}
                  </div>
                  <div className="p2b-result-actions">
                    <button
                      type="button"
                      className="p2b-rerun-btn"
                      onClick={handleSynthesize}
                      disabled={isLoading}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M1 4v6h6M23 20v-6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      {isLoading ? 'Re-running...' : 'Re-run'}
                    </button>
                    <button
                      type="button"
                      className="p2b-edit-sources-btn"
                      onClick={handleEditSources}
                      disabled={isLoading}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Edit Sources
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>

          {/* Error message */}
          {error && (
            <div className="p2b-error">
              {error}
            </div>
          )}

          {/* Loading overlay */}
          {isLoading && (
            <div className="p2b-loading">
              <div className="p2b-spinner" />
              <span>Synthesizing sources...</span>
            </div>
          )}

          {/* Submit */}
          <div className="p2b-submit-row">
            {synthesizedText === null && (
              <button
                type="button"
                className="p2b-submit-btn"
                disabled={!hasBlobs || isLoading}
                onClick={handleSynthesize}
              >
                {isLoading ? 'Synthesizing...' : 'Synthesize Sources'}
              </button>
            )}
            <button type="button" className="p2b-copy-json-btn" onClick={handleCopyJson}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" strokeWidth="2"/>
              </svg>
              {copied ? 'Copied!' : 'Copy JSON'}
            </button>
            <button type="button" className="p2b-clear-btn" onClick={handleClear}>
              Clear All
            </button>
          </div>

        </form>
      </main>
    </div>
  )
}
