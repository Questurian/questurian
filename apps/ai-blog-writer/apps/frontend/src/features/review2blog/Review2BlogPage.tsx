import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  uploadReviewJson,
  runPhase2,
  runPhase3,
  type ReviewPhase1Response,
  type ReviewPhase2Response,
  type ReviewPhase3Response,
  type RestaurantContext,
  type ListicleConfig,
} from './api'
import './styles.css'

type PhaseStatus = 'pending' | 'running' | 'done' | 'error'
type WizardStep = 'upload' | 'processing-1-2' | 'listicle-input' | 'processing-3' | 'complete'

interface PipelineProgressProps {
  phase1Status: PhaseStatus
  phase2Status: PhaseStatus
  phase3Status: PhaseStatus
  showPhase3?: boolean
}

function PipelineProgress({ phase1Status, phase2Status, phase3Status, showPhase3 = true }: PipelineProgressProps) {
  const phases = [
    { num: 1, label: 'Extract Experience Signals', status: phase1Status },
    { num: 2, label: 'Aggregate Profile', status: phase2Status },
    ...(showPhase3 ? [{ num: 3, label: 'Generate Blurb', status: phase3Status }] : []),
  ]

  return (
    <div className="r2b-pipeline-progress-centered">
      <h3>Pipeline Progress</h3>
      <div className="r2b-stage-checklist">
        {phases.map((phase) => (
          <div key={phase.num} className={`r2b-stage-item ${phase.status}`}>
            <div className="r2b-stage-dot" />
            <span>Phase {phase.num}: {phase.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Review2BlogPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [response, setResponse] = useState<ReviewPhase1Response | null>(null)
  const [phase2Response, setPhase2Response] = useState<ReviewPhase2Response | null>(null)
  const [phase3Response, setPhase3Response] = useState<ReviewPhase3Response | null>(null)
  const [restaurantContext, setRestaurantContext] = useState<RestaurantContext | null>(null)
  const [listicleConfig, setListicleConfig] = useState<ListicleConfig>({
    listicle_type: '',
    listicle_title: '',
    listicle_goal: '',
  })

  const phase3Mutation = useMutation({
    mutationFn: runPhase3,
    onSuccess: (data) => {
      setPhase3Response(data)
    }
  })

  const phase2Mutation = useMutation({
    mutationFn: runPhase2,
    onSuccess: (data) => {
      setPhase2Response(data)
    }
  })

  const uploadMutation = useMutation({
    mutationFn: uploadReviewJson,
    onSuccess: (data) => {
      setResponse(data)
      setRestaurantContext(data.restaurant_context)
      setPhase2Response(null)
      setPhase3Response(null)
      if (data.parsed && !data.parse_error) {
        phase2Mutation.mutate(data.parsed)
      }
    }
  })

  // Determine current wizard step
  const currentStep = useMemo((): WizardStep => {
    // Processing phase 3
    if (phase3Mutation.isPending) {
      return 'processing-3'
    }
    // Complete - phase 3 finished
    if (phase3Response) {
      return 'complete'
    }
    // Listicle input - phase 2 done, waiting for user input
    if (phase2Response?.parsed && !phase2Response.parse_error) {
      return 'listicle-input'
    }
    // Processing phases 1 & 2
    if (uploadMutation.isPending || phase2Mutation.isPending) {
      return 'processing-1-2'
    }
    // Upload screen
    return 'upload'
  }, [uploadMutation.isPending, phase2Mutation.isPending, phase3Mutation.isPending, phase2Response, phase3Response])

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!selectedFile) {
      return
    }
    setResponse(null)
    setPhase2Response(null)
    setPhase3Response(null)
    setRestaurantContext(null)
    phase2Mutation.reset()
    phase3Mutation.reset()
    uploadMutation.mutate(selectedFile)
  }

  const handleRunPhase3 = () => {
    if (!phase2Response?.parsed || !restaurantContext) {
      return
    }
    phase3Mutation.mutate({
      aggregated_profile: phase2Response.parsed,
      restaurant_context: restaurantContext,
      listicle: listicleConfig,
    })
  }

  const isListicleConfigValid =
    listicleConfig.listicle_type.trim() !== '' &&
    listicleConfig.listicle_title.trim() !== '' &&
    listicleConfig.listicle_goal.trim() !== ''

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault()
    setIsDragOver(false)
  }

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault()
    setIsDragOver(false)

    const files = Array.from(event.dataTransfer.files)
    const jsonFile = files.find(file => file.type === 'application/json' || file.name.toLowerCase().endsWith('.json'))

    if (jsonFile) {
      setSelectedFile(jsonFile)
      setResponse(null)
      setPhase2Response(null)
      setPhase3Response(null)
      setRestaurantContext(null)
      uploadMutation.reset()
      phase2Mutation.reset()
      phase3Mutation.reset()
    }
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      setResponse(null)
      setPhase2Response(null)
      setPhase3Response(null)
      setRestaurantContext(null)
      uploadMutation.reset()
      phase2Mutation.reset()
      phase3Mutation.reset()
    }
  }

  const handleStartOver = () => {
    setSelectedFile(null)
    setResponse(null)
    setPhase2Response(null)
    setPhase3Response(null)
    setRestaurantContext(null)
    setListicleConfig({
      listicle_type: '',
      listicle_title: '',
      listicle_goal: '',
    })
    uploadMutation.reset()
    phase2Mutation.reset()
    phase3Mutation.reset()
  }

  const phase1Status = useMemo((): PhaseStatus => {
    if (uploadMutation.isError) return 'error'
    if (uploadMutation.isPending) return 'running'
    if (response) return 'done'
    return 'pending'
  }, [uploadMutation.isPending, uploadMutation.isError, response])

  const phase2Status = useMemo((): PhaseStatus => {
    if (phase2Mutation.isError) return 'error'
    if (phase2Mutation.isPending) return 'running'
    if (phase2Response) return 'done'
    return 'pending'
  }, [phase2Mutation.isPending, phase2Mutation.isError, phase2Response])

  const phase3Status = useMemo((): PhaseStatus => {
    if (phase3Mutation.isError) return 'error'
    if (phase3Mutation.isPending) return 'running'
    if (phase3Response) return 'done'
    return 'pending'
  }, [phase3Mutation.isPending, phase3Mutation.isError, phase3Response])

  return (
    <div className="review2blog-page">
      <header className="review2blog-hero">
        <div>
          <p className="review2blog-eyebrow">Questurian Studio</p>
          <h1>Turn review data into <span className="review2blog-underline-text">experience signals</span><span className="review2blog-green-dot">.</span></h1>
          <p className="review2blog-lede">
            Upload a JSON file of restaurant reviews and get structured experience signals back from Gemini.
          </p>
        </div>
        <div className="review2blog-badge-row">
          <Link to="/" className="review2blog-nav-link">← Home</Link>
        </div>
      </header>

      <main className="review2blog-wizard">
        {/* Step 1: Upload */}
        {currentStep === 'upload' && (
          <section className="review2blog-panel r2b-wizard-panel">
            <div className="review2blog-panel-header">
              <h2>Upload Review JSON</h2>
              <p>Provide a JSON object with restaurant context and a <strong>reviews</strong> array. Each review needs <strong>text</strong>, <strong>rating</strong>, and <strong>date</strong> fields.</p>
            </div>
            <form className="review2blog-panel-body" onSubmit={handleSubmit}>
              <div
                className={`review2blog-file-input ${isDragOver ? 'drag-over' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => document.getElementById('review-json-input')?.click()}
              >
                <input
                  id="review-json-input"
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
                {selectedFile ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                    <span>{selectedFile.name}</span>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z" fill="#10b981"/>
                      <path d="M14 9H13V4L18 9H14Z" fill="#10b981"/>
                      <path d="M16 13H8V15H16V13Z" fill="white"/>
                      <path d="M16 17H8V19H16V17Z" fill="white"/>
                    </svg>
                  </div>
                ) : (
                  <span>
                    {isDragOver
                      ? 'Drop JSON file here'
                      : 'Choose a JSON file or drag and drop'
                    }
                  </span>
                )}
              </div>
              <div className="review2blog-button-row">
                <button type="submit" className="review2blog-submit-btn" disabled={!selectedFile || uploadMutation.isPending}>
                  Start Pipeline
                </button>
              </div>
              {uploadMutation.isError ? (
                <p className="review2blog-error">Upload failed. Check the backend logs.</p>
              ) : null}
            </form>
          </section>
        )}

        {/* Step 2: Processing Phases 1 & 2 */}
        {currentStep === 'processing-1-2' && (
          <section className="review2blog-panel r2b-wizard-panel r2b-processing-panel">
            <div className="r2b-processing-content">
              <PipelineProgress
                phase1Status={phase1Status}
                phase2Status={phase2Status}
                phase3Status={phase3Status}
                showPhase3={false}
              />
              <p className="r2b-processing-message">
                {uploadMutation.isPending && 'Extracting experience signals from reviews...'}
                {phase2Mutation.isPending && 'Aggregating into restaurant profile...'}
              </p>
              {uploadMutation.isError && (
                <div className="r2b-error-block">
                  <p className="review2blog-error">Phase 1 failed. Check the backend logs.</p>
                  <button className="review2blog-submit-btn" onClick={handleStartOver}>Start Over</button>
                </div>
              )}
              {phase2Mutation.isError && (
                <div className="r2b-error-block">
                  <p className="review2blog-error">Phase 2 failed. Check the backend logs.</p>
                  <button className="review2blog-submit-btn" onClick={handleStartOver}>Start Over</button>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Step 3: Listicle Configuration Input */}
        {currentStep === 'listicle-input' && (
          <section className="review2blog-panel r2b-wizard-panel">
            <div className="review2blog-panel-header">
              <div className="r2b-step-indicator">
                <span className="r2b-step-check">✓</span>
                <span>Phases 1 & 2 Complete</span>
              </div>
              <h2>Configure Listicle</h2>
              <p>Provide context for generating the restaurant blurb.</p>
            </div>
            <div className="review2blog-panel-body">
              <div className="review2blog-json-input">
                <label htmlFor="listicle-type">Listicle Type</label>
                <input
                  id="listicle-type"
                  type="text"
                  placeholder="e.g., Neighborhood Guide, Date Night, Best Of..."
                  value={listicleConfig.listicle_type}
                  onChange={(e) => setListicleConfig(prev => ({ ...prev, listicle_type: e.target.value }))}
                  className="review2blog-json-textarea"
                  style={{ minHeight: 'auto', padding: '0.75rem' }}
                />
              </div>
              <div className="review2blog-json-input">
                <label htmlFor="listicle-title">Listicle Title</label>
                <input
                  id="listicle-title"
                  type="text"
                  placeholder="e.g., The 15 Best Restaurants in Barranco"
                  value={listicleConfig.listicle_title}
                  onChange={(e) => setListicleConfig(prev => ({ ...prev, listicle_title: e.target.value }))}
                  className="review2blog-json-textarea"
                  style={{ minHeight: 'auto', padding: '0.75rem' }}
                />
              </div>
              <div className="review2blog-json-input">
                <label htmlFor="listicle-goal">Listicle Goal</label>
                <textarea
                  id="listicle-goal"
                  placeholder="e.g., Help travelers find romantic dinner spots in Barranco with great ambiance..."
                  value={listicleConfig.listicle_goal}
                  onChange={(e) => setListicleConfig(prev => ({ ...prev, listicle_goal: e.target.value }))}
                  rows={3}
                  className="review2blog-json-textarea"
                  style={{ minHeight: '100px' }}
                />
              </div>
              <div className="review2blog-button-row">
                <button
                  type="button"
                  className="review2blog-submit-btn"
                  onClick={handleRunPhase3}
                  disabled={!isListicleConfigValid}
                >
                  Generate Blurb
                </button>
                <button
                  type="button"
                  className="review2blog-clear-btn"
                  onClick={handleStartOver}
                >
                  Start Over
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Step 4: Processing Phase 3 */}
        {currentStep === 'processing-3' && (
          <section className="review2blog-panel r2b-wizard-panel r2b-processing-panel">
            <div className="r2b-processing-content">
              <PipelineProgress
                phase1Status="done"
                phase2Status="done"
                phase3Status="running"
              />
              <p className="r2b-processing-message">Generating listicle blurb...</p>
              {phase3Mutation.isError && (
                <div className="r2b-error-block">
                  <p className="review2blog-error">Phase 3 failed. Check the backend logs.</p>
                  <button className="review2blog-submit-btn" onClick={handleStartOver}>Start Over</button>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Step 5: Complete - Final Output */}
        {currentStep === 'complete' && phase3Response && (
          <section className="review2blog-panel r2b-wizard-panel r2b-complete-panel">
            <div className="review2blog-panel-header">
              <div className="r2b-step-indicator r2b-complete-indicator">
                <span className="r2b-step-check">✓</span>
                <span>Pipeline Complete</span>
              </div>
              <h2>Generated Blurb</h2>
              <p>Listicle: "{listicleConfig.listicle_title}"</p>
            </div>
            <div className="review2blog-panel-body">
              <div className="r2b-blurb-output">
                {phase3Response.blurb}
              </div>
              <div className="review2blog-button-row">
                <button
                  type="button"
                  className="review2blog-submit-btn"
                  onClick={() => navigator.clipboard.writeText(phase3Response.blurb)}
                >
                  Copy to Clipboard
                </button>
                <button
                  type="button"
                  className="review2blog-clear-btn"
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
