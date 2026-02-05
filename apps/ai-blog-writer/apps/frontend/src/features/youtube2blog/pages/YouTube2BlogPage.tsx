import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  clearDatabase,
  fetchDebug,
  fetchStatus,
  uploadCsv,
  convertMarkdownToLexical
} from '../api'
import type { StatusResponse } from '@shared/types'
import payloadLogoUrl from '../../../assets/payload-logo.svg?url'

const STAGE_ORDER = [
  'stage_0',
  'stage_1',
  'stage_2',
  'stage_3',
  'stage_4',
  'complete'
]

const STAGE_LABELS: Record<string, string> = {
  stage_0: 'Stage 0: CSV received',
  stage_1: 'Stage 1: Transcript cleaned',
  stage_2: 'Stage 2: Article classified',
  stage_3: 'Stage 3: Article composed',
  stage_4: 'Stage 4: Title generated',
  complete: 'Complete'
}

function StatusPanel({ status }: { status: StatusResponse }) {
  // Custom logic for stage_0 label
  let stageLabel: string
  if (status.stage === 'stage_0') {
    stageLabel = status.run_id === 'dev-mode' ? 'Awaiting Data' : 'Data Received'
  } else {
    stageLabel = STAGE_LABELS[status.stage] ?? status.stage.replace(/_/g, ' ').toUpperCase()
  }

  const stageIndex = STAGE_ORDER.indexOf(status.stage)

  // Determine current phase for each stage based on pipeline state
  const getStagePhase = (stageNum: number) => {
    // If we're at the initial stage (CSV received), all stages are pending
    if (stageIndex === 0) {
      return 'Pending'
    }

    // If entire pipeline is completed, all stages are completed
    if (status.state === 'completed') {
      return 'Completed'
    }

    // If we've progressed past this stage, it's completed
    if (stageIndex > stageNum) {
      return 'Completed'
    }

    // If this is the current stage, show the phase based on state
    if (stageIndex === stageNum) {
      if (status.state === 'running') {
        switch (stageNum) {
          case 1:
            return 'Clean Transcript'
          case 2:
            return 'Classify Article Type'
          case 3:
            return 'Compose Article'
          case 4:
            return 'Generate Title'
          default:
            return 'Processing'
        }
      } else {
        // Current stage but not running (could be failed or just started)
        return 'Completed'
      }
    }

    // If we haven't reached this stage yet, it's pending
    return 'Pending'
  }

  const stageOneState =
    stageIndex >= 2 || status.state === 'completed'
      ? 'done'
      : status.stage === 'stage_1' && status.state === 'running'
        ? 'running'
        : 'pending'
  const stageTwoState =
    stageIndex >= 3 || status.state === 'completed'
      ? 'done'
      : status.stage === 'stage_2' && status.state === 'running'
        ? 'running'
        : stageIndex >= 2
          ? 'done'
          : 'pending'
  const stageThreeState =
    stageIndex >= 4 || status.state === 'completed'
      ? 'done'
      : status.stage === 'stage_3' && status.state === 'running'
        ? 'running'
        : stageIndex >= 3
          ? 'done'
          : 'pending'
  const stageFourState =
    status.state === 'completed'
      ? 'done'
      : status.stage === 'stage_4' && status.state === 'running'
        ? 'running'
        : stageIndex >= 4
          ? 'done'
          : 'pending'
  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Pipeline status</p>
          <h2>{stageLabel}</h2>
          <p className={`status ${status.state}`}>{status.state}</p>
        </div>
      </div>
      <div className="panel-body">
        {status.error ? <p className="error">{status.error}</p> : null}
        <div className="stage-checklist">
          <div className={`stage-item ${stageOneState}`}>
            <span className="stage-dot" />
            <span>Stage 1 - ({getStagePhase(1)})</span>
          </div>
          <div className={`stage-item ${stageTwoState}`}>
            <span className="stage-dot" />
            <span>Stage 2 - ({getStagePhase(2)})</span>
          </div>
          <div className={`stage-item ${stageThreeState}`}>
            <span className="stage-dot" />
            <span>Stage 3 - ({getStagePhase(3)})</span>
          </div>
          <div className={`stage-item ${stageFourState}`}>
            <span className="stage-dot" />
            <span>Stage 4 - ({getStagePhase(4)})</span>
          </div>
        </div>
        {status.evaluation_metrics ? (
          <div className="metrics">
            {Object.entries(status.evaluation_metrics).map(([key, value]) => (
              <div key={key} className="metric">
                <span>{key}</span>
                <strong>{value.toFixed(3)}</strong>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default function YouTube2BlogPage() {
  const queryClient = useQueryClient()
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [runIds, setRunIds] = useState<string[]>([])
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [showDebug, setShowDebug] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [resultTab, setResultTab] = useState<'final' | 'transcript' | 'classification' | 'article' | 'title'>('final')
  const [lexicalCopyStatus, setLexicalCopyStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')

  const uploadMutation = useMutation({
    mutationFn: uploadCsv,
    onSuccess: (data) => {
      const ids = data.run_ids ?? (data.run_id ? [data.run_id] : [])
      setRunIds(ids)
      setActiveRunId(ids[0] ?? null)
    }
  })

  const clearMutation = useMutation({
    mutationFn: clearDatabase,
    onSuccess: () => {
      setRunIds([])
      setActiveRunId(null)
      setSelectedFile(null)
    }
  })

  const statusQuery = useQuery({
    queryKey: ['status', activeRunId],
    queryFn: () => fetchStatus(activeRunId as string),
    enabled: Boolean(activeRunId),
    refetchInterval: (query) => {
      const current = query.state.data as StatusResponse | undefined
      if (!current) {
        return 1000
      }
      return current.state === 'completed' || current.state === 'failed' ? false : 1000
    }
  })

  const debugQuery = useQuery({
    queryKey: ['debug', activeRunId],
    queryFn: () => fetchDebug(activeRunId as string),
    enabled: Boolean(activeRunId) && (showDebug || resultTab === 'final' || resultTab === 'transcript' || resultTab === 'classification' || resultTab === 'article' || resultTab === 'title'),
    staleTime: 0,  // Always refetch when enabled
  })

  // Function to remove the first heading from article content for the Article tab
  const removeTitleFromArticle = (articleContent: string): string => {
    if (!articleContent) return articleContent
    // Remove the first level-1 heading (# Title) and any following empty lines
    return articleContent.replace(/^# .+\n+\n?/, '').trim()
  }

  const activeStatus = statusQuery.data

  // Immediately fetch results when status changes to completed
  useEffect(() => {
    if (activeStatus?.state === 'completed' && activeRunId) {
      queryClient.invalidateQueries({ queryKey: ['result', activeRunId] })
      queryClient.invalidateQueries({ queryKey: ['debug', activeRunId] })
    }
  }, [activeStatus?.state, activeRunId, queryClient])

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!selectedFile) {
      return
    }
    uploadMutation.mutate(selectedFile)
  }

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
    const csvFile = files.find(file => file.type === 'text/csv' || file.name.toLowerCase().endsWith('.csv'))

    if (csvFile) {
      setSelectedFile(csvFile)
    }
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setSelectedFile(file)
    }
  }

  const handleCopyLexical = async (markdown: string) => {
    setLexicalCopyStatus('loading')
    try {
      const result = await convertMarkdownToLexical(markdown)
      if (result.success && result.data) {
        await navigator.clipboard.writeText(JSON.stringify(result.data, null, 2))
        setLexicalCopyStatus('success')
        setTimeout(() => setLexicalCopyStatus('idle'), 2000)
      } else {
        console.error('Conversion failed:', result.error)
        setLexicalCopyStatus('error')
        setTimeout(() => setLexicalCopyStatus('idle'), 3000)
      }
    } catch (error) {
      console.error('Failed to convert/copy:', error)
      setLexicalCopyStatus('error')
      setTimeout(() => setLexicalCopyStatus('idle'), 3000)
    }
  }

  const activeBadge = useMemo(() => {
    if (activeRunId) {
      return `Active run: ${activeRunId}`
    }
    if (uploadMutation.isPending) {
      return 'Uploading...'
    }
    if (selectedFile) {
      return 'File Selected'
    }
    return 'Awaiting Upload'
  }, [activeRunId, selectedFile, uploadMutation.isPending])

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">Questurian Studio</p>
          <h1>Turn YouTube transcripts into <span className="underline-text">clean articles</span><span className="orange-dot">.</span></h1>
          <p className="lede">
            Transform raw transcripts into polished articles with AI-powered precision.
          </p>
        </div>
        <div className="badge-row">
          <div className="badge">
            {activeBadge}
          </div>
          <Link to="/" className="nav-link">← Home</Link>
          <Link to="/youtube2blog/articles" className="nav-link">Saved Articles</Link>
          <Link to="/youtube2blog/article-types" className="nav-link">Article Types</Link>
          <Link to="/youtube2blog/stage" className="nav-link">Stage</Link>
        </div>
      </header>

      <main className="layout">
        {!activeRunId ? (
          // Upload phase - show upload panel
          <section className="panel upload">
            <div className="panel-header">
              <h2>Upload CSV</h2>
              <p>Upload a CSV file with YouTube video transcripts, and our AI will transform each one into a professionally written article, complete with smart classification, content enhancement, and compelling titles.</p>
            </div>
            <form className="panel-body" onSubmit={handleSubmit}>
              <div
                className={`file-input ${isDragOver ? 'drag-over' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => document.getElementById('csv-file-input')?.click()}
              >
                <input
                  id="csv-file-input"
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
                {selectedFile ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                    <span>{selectedFile.name}</span>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z" fill="#f36f2b"/>
                      <path d="M14 9H13V4L18 9H14Z" fill="#f36f2b"/>
                      <path d="M16 13H8V15H16V13Z" fill="white"/>
                      <path d="M16 17H8V19H16V17Z" fill="white"/>
                    </svg>
                  </div>
                ) : (
                  <span>
                    {isDragOver
                      ? 'Drop CSV file here'
                      : 'Choose a CSV file or drag and drop'
                    }
                  </span>
                )}
              </div>
              <div className="button-row">
                <button type="submit" disabled={!selectedFile || uploadMutation.isPending}>
                  {uploadMutation.isPending ? 'Uploading...' : 'Start pipeline'}
                </button>
                <button
                  type="button"
                  className="clear-btn"
                  onClick={() => clearMutation.mutate()}
                  disabled={clearMutation.isPending}
                >
                  {clearMutation.isPending ? 'Clearing...' : 'Clear'}
                </button>
              </div>
              {uploadMutation.isError ? (
                <p className="error">Upload failed. Check the backend logs.</p>
              ) : null}
              {runIds.length > 1 ? (
                <div className="run-list">
                  {runIds.map((runId) => (
                    <button
                      type="button"
                      key={runId}
                      className={runId === activeRunId ? 'run active' : 'run'}
                      onClick={() => setActiveRunId(runId)}
                    >
                      {runId}
                    </button>
                  ))}
                </div>
              ) : null}
            </form>
          </section>
        ) : activeStatus && activeStatus.state !== 'completed' ? (
          // Processing phase - show status panel
          <section>
            <StatusPanel status={activeStatus} />
          </section>
        ) : (
          // Completed phase - show results with tabs
          <section className="panel result">
            <div className="result-tabs">
              <button
                type="button"
                className={`result-tab ${resultTab === 'final' ? 'active' : ''}`}
                onClick={() => setResultTab('final')}
              >
                Final Results
              </button>
              <button
                type="button"
                className={`result-tab ${resultTab === 'transcript' ? 'active' : ''}`}
                onClick={() => setResultTab('transcript')}
              >
                Transcript
              </button>
              <button
                type="button"
                className={`result-tab ${resultTab === 'classification' ? 'active' : ''}`}
                onClick={() => setResultTab('classification')}
              >
                Classification
              </button>
              <button
                type="button"
                className={`result-tab ${resultTab === 'article' ? 'active' : ''}`}
                onClick={() => setResultTab('article')}
              >
                Article
              </button>
              <button
                type="button"
                className={`result-tab ${resultTab === 'title' ? 'active' : ''}`}
                onClick={() => setResultTab('title')}
              >
                Title
              </button>
            </div>

            <div className="panel-body">
              {resultTab === 'final' ? (
                <>
                  {/* Copy as Lexical JSON Button */}
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
                    {(() => {
                      const stage3Data = (debugQuery.data?.stages as Record<string, { data?: { final_article?: string } }>)?.stage_3?.data
                      const markdown = stage3Data?.final_article
                      return (
                        <button
                          type="button"
                          className="payload-btn"
                          disabled={!markdown || lexicalCopyStatus === 'loading'}
                          onClick={() => markdown && handleCopyLexical(markdown)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.75rem 1.5rem',
                            borderRadius: '8px',
                            border: '2px solid #000',
                            backgroundColor: lexicalCopyStatus === 'success' ? '#22c55e' : lexicalCopyStatus === 'error' ? '#ef4444' : '#000',
                            color: '#fff',
                            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                            fontSize: '0.95rem',
                            fontWeight: 600,
                            cursor: !markdown || lexicalCopyStatus === 'loading' ? 'not-allowed' : 'pointer',
                            transition: 'all 0.2s ease',
                            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                            opacity: !markdown ? 0.5 : 1
                          }}
                          onMouseEnter={(e) => {
                            if (markdown && lexicalCopyStatus === 'idle') {
                              e.currentTarget.style.backgroundColor = '#333';
                              e.currentTarget.style.transform = 'translateY(-1px)';
                              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.4)';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (lexicalCopyStatus === 'idle') {
                              e.currentTarget.style.backgroundColor = '#000';
                            }
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.3)';
                          }}
                        >
                          <img
                            src={payloadLogoUrl}
                            alt="Payload CMS Logo"
                            style={{
                              width: '24px',
                              height: '24px',
                              flexShrink: 0,
                              filter: 'invert(1)'
                            }}
                          />
                          {lexicalCopyStatus === 'loading' ? 'Converting...' :
                           lexicalCopyStatus === 'success' ? 'Copied to Clipboard!' :
                           lexicalCopyStatus === 'error' ? 'Conversion Failed' :
                           'Copy as Lexical JSON'}
                        </button>
                      )
                    })()}
                  </div>
                  {(() => {
                    const stage4Data = (debugQuery.data?.stages as Record<string, { data?: {
                      title?: string;
                      content?: string;
                      article_type?: string;
                      title_guideline_used?: string;
                    } }>)?.stage_4?.data
                    const stage3Data = (debugQuery.data?.stages as Record<string, { data?: {
                      article_type?: string;
                      coverage_sufficient?: boolean;
                      coverage_analysis?: string;
                      missing_sections?: string[];
                      supplemental_content?: string;
                      final_article?: string;
                    } }>)?.stage_3?.data

                    return (
                      <div className="final-results">
                        {stage4Data?.title && (
                          <div className="generated-title">
                            <h2 className="title-display">{stage4Data.title}</h2>
                          </div>
                        )}
                        {stage3Data?.final_article && (
                          <div className="article-result">
                            <div className="article-content">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{removeTitleFromArticle(stage3Data.final_article)}</ReactMarkdown>
                            </div>
                          </div>
                        )}
                        {(!stage4Data?.title && !stage3Data?.final_article) && (
                          <p className="placeholder">Final results are being prepared...</p>
                        )}
                      </div>
                    )
                  })()}
                </>
              ) : resultTab === 'transcript' ? (
                <>
                  {(() => {
                    const stage1Data = (debugQuery.data?.stages as Record<string, { data?: { cleaned_transcript?: string } }>)?.stage_1?.data
                    if (!stage1Data || !stage1Data.cleaned_transcript) {
                      return <p className="placeholder">No transcript yet. Finish Stage 1 to see results.</p>
                    }
                    return (
                      <div className="transcript-content">
                        <pre>{stage1Data.cleaned_transcript}</pre>
                      </div>
                    )
                  })()}
                </>
              ) : resultTab === 'classification' ? (
                <>
                  {(() => {
                    const stage2Data = (debugQuery.data?.stages as Record<string, { data?: { classification?: string; confidence?: number; reasoning?: string } }>)?.stage_2?.data
                    if (!stage2Data) {
                      return <p className="placeholder">No classification yet. Finish Stage 2 to see results.</p>
                    }
                    const confidence = stage2Data.confidence ?? 0
                    return (
                      <div className="classification-result">
                        <div className="classification-type">{stage2Data.classification}</div>
                        <div className="confidence-section">
                          <span className="confidence-label">Confidence: {Math.round(confidence * 100)}%</span>
                          <div className="confidence-bar">
                            <div className="confidence-fill" style={{ width: `${confidence * 100}%` }} />
                          </div>
                        </div>
                        {stage2Data.reasoning ? (
                          <p className="reasoning">"{stage2Data.reasoning}"</p>
                        ) : null}
                      </div>
                    )
                  })()}
                </>
              ) : resultTab === 'article' ? (
                <>
                  {(() => {
                    const stage3Data = (debugQuery.data?.stages as Record<string, { data?: {
                      article_type?: string;
                      coverage_sufficient?: boolean;
                      coverage_analysis?: string;
                      missing_sections?: string[];
                      supplemental_content?: string;
                      final_article?: string;
                    } }>)?.stage_3?.data
                    if (!stage3Data) {
                      return <p className="placeholder">No article yet. Finish Stage 3 to see results.</p>
                    }
                    return (
                      <div className="article-result">
                        <div className="article-content">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{removeTitleFromArticle(stage3Data.final_article ?? '')}</ReactMarkdown>
                        </div>
                      </div>
                    )
                  })()}
                </>
              ) : (
                <>
                  {(() => {
                    const stage4Data = (debugQuery.data?.stages as Record<string, { data?: {
                      title?: string;
                      content?: string;
                      article_type?: string;
                      title_guideline_used?: string;
                    } }>)?.stage_4?.data
                    if (!stage4Data) {
                      return <p className="placeholder">No title yet. Finish Stage 4 to see results.</p>
                    }
                    return (
                      <div className="title-result">
                        <div className="generated-title">
                          <strong>Generated Title:</strong>
                          <h2 className="title-display">{stage4Data.title}</h2>
                        </div>
                      </div>
                    )
                  })()}
                </>
              )}
            </div>
          </section>
        )}

        {activeRunId && activeStatus?.state === 'completed' ? (
          <section className="panel debug">
            <div className="panel-header">
              <h2>Debug View</h2>
              <button
                type="button"
                className="toggle-btn"
                onClick={() => setShowDebug(!showDebug)}
              >
                {showDebug ? 'Hide' : 'Show'} Stage Data
              </button>
            </div>
            {showDebug && debugQuery.data ? (
              <div className="panel-body debug-content">
                <div className="stage-box">
                  <h3>Stage 0: Raw Input</h3>
                  <pre>{JSON.stringify((debugQuery.data.stages as Record<string, {data?: unknown}>)?.stage_0?.data ?? {}, null, 2)}</pre>
                </div>
                <div className="stage-box">
                  <h3>Stage 1: Transcript cleaned</h3>
                  <pre>{JSON.stringify((debugQuery.data.stages as Record<string, {data?: unknown}>)?.stage_1?.data ?? {}, null, 2)}</pre>
                </div>
                {(() => {
                  const stage2 = (debugQuery.data.stages as Record<string, {data?: {debug_prompt?: string; debug_raw_response?: string; classification?: string; confidence?: number; reasoning?: string}}>)?.stage_2?.data
                  return (
                    <>
                      <div className="stage-box">
                        <h3>Stage 2: Request to Vertex AI</h3>
                        <pre>{stage2?.debug_prompt ?? 'No prompt captured'}</pre>
                      </div>
                      <div className="stage-box">
                        <h3>Stage 2: Raw Response from Vertex AI</h3>
                        <pre>{stage2?.debug_raw_response ?? 'No response captured'}</pre>
                      </div>
                      <div className="stage-box">
                        <h3>Stage 2: Parsed Result</h3>
                        <pre>{JSON.stringify({
                          classification: stage2?.classification,
                          confidence: stage2?.confidence,
                          reasoning: stage2?.reasoning,
                        }, null, 2)}</pre>
                      </div>
                    </>
                  )
                })()}
                {(() => {
                  const stage3 = (debugQuery.data.stages as Record<string, {data?: {
                    debug_coverage_prompt?: string;
                    debug_coverage_response?: string;
                    debug_supplement_prompt?: string;
                    debug_supplement_response?: string;
                    debug_composition_prompt?: string;
                    debug_composition_response?: string;
                    article_type?: string;
                    coverage_sufficient?: boolean;
                    coverage_analysis?: string;
                    missing_sections?: string[];
                    supplemental_content?: string;
                    final_article?: string;
                    guideline_used?: string;
                  }}>)?.stage_3?.data
                  if (!stage3) return null
                  return (
                    <>
                      <div className="stage-box">
                        <h3>Stage 3: Coverage Analysis Request</h3>
                        <pre>{stage3?.debug_coverage_prompt ?? 'No prompt captured'}</pre>
                      </div>
                      <div className="stage-box">
                        <h3>Stage 3: Coverage Analysis Response</h3>
                        <pre>{stage3?.debug_coverage_response ?? 'No response captured'}</pre>
                      </div>
                      {stage3?.debug_supplement_prompt ? (
                        <>
                          <div className="stage-box">
                            <h3>Stage 3: Supplement Generation Request</h3>
                            <pre>{stage3.debug_supplement_prompt}</pre>
                          </div>
                          <div className="stage-box">
                            <h3>Stage 3: Supplement Generation Response</h3>
                            <pre>{stage3?.debug_supplement_response ?? 'No response captured'}</pre>
                          </div>
                        </>
                      ) : null}
                      <div className="stage-box">
                        <h3>Stage 3: Article Composition Request</h3>
                        <pre>{stage3?.debug_composition_prompt ?? 'No prompt captured'}</pre>
                      </div>
                      <div className="stage-box">
                        <h3>Stage 3: Article Composition Response</h3>
                        <pre>{stage3?.debug_composition_response ?? 'No response captured'}</pre>
                      </div>
                      <div className="stage-box">
                        <h3>Stage 3: Parsed Result</h3>
                        <pre>{JSON.stringify({
                          article_type: stage3?.article_type,
                          coverage_sufficient: stage3?.coverage_sufficient,
                          coverage_analysis: stage3?.coverage_analysis,
                          missing_sections: stage3?.missing_sections,
                          supplemental_content_length: stage3?.supplemental_content?.length ?? 0,
                          final_article_length: stage3?.final_article?.length ?? 0,
                          guideline_used_length: stage3?.guideline_used?.length ?? 0,
                        }, null, 2)}</pre>
                      </div>
                    </>
                  )
                })()}
                {(() => {
                  const stage4 = (debugQuery.data.stages as Record<string, {data?: {
                    debug_prompt?: string;
                    debug_raw_response?: string;
                    title?: string;
                    content?: string;
                    article_type?: string;
                    title_guideline_used?: string;
                  }}>)?.stage_4?.data
                  if (!stage4) return null
                  return (
                    <>
                      <div className="stage-box">
                        <h3>Stage 4: Title Generation Request</h3>
                        <pre>{stage4?.debug_prompt ?? 'No prompt captured'}</pre>
                      </div>
                      <div className="stage-box">
                        <h3>Stage 4: Title Generation Response</h3>
                        <pre>{stage4?.debug_raw_response ?? 'No response captured'}</pre>
                      </div>
                      <div className="stage-box">
                        <h3>Stage 4: Parsed Result</h3>
                        <pre>{JSON.stringify({
                          title: stage4?.title,
                          article_type: stage4?.article_type,
                          title_guideline_used_length: stage4?.title_guideline_used?.length ?? 0,
                          content_length: stage4?.content?.length ?? 0,
                        }, null, 2)}</pre>
                      </div>
                    </>
                  )
                })()}
              </div>
            ) : showDebug ? (
              <div className="panel-body">
                <p>Loading debug data...</p>
              </div>
            ) : null}
          </section>
        ) : null}
      </main>

    </div>
  )
}
