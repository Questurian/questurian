import { useState } from 'react'

type Phase =
  | { kind: 'idle' }
  | { kind: 'generating' }
  | { kind: 'done'; title: string }
  | { kind: 'error'; message: string }

export type AiTitleGenerateInput = {
  prompt: string
}

type AiTitleInputProps = {
  currentTitle: string
  onGenerate: (input: AiTitleGenerateInput) => Promise<string>
  onApply: (title: string) => void
  disabledReason?: string
}

export function AiTitleInput({ currentTitle, onGenerate, onApply, disabledReason }: AiTitleInputProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })

  const isGenerating = phase.kind === 'generating'

  const handleGenerate = async () => {
    const trimmed = prompt.trim()
    if (!trimmed) {
      setPhase({ kind: 'error', message: 'Enter an instruction before generating.' })
      return
    }

    setPhase({ kind: 'generating' })

    try {
      const title = await onGenerate({ prompt: trimmed })
      if (!title.trim()) throw new Error('AI returned an empty title.')
      setPhase({ kind: 'done', title: title.trim() })
    } catch (err) {
      setPhase({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Title improvement failed. Try again.',
      })
    }
  }

  const handleApply = () => {
    if (phase.kind !== 'done') return
    onApply(phase.title)
    handleClose()
  }

  const handleClose = () => {
    setIsOpen(false)
    setPrompt('')
    setPhase({ kind: 'idle' })
  }

  return (
    <>
      <button
        type="button"
        className="block-markdown-ai-btn subtle stl-ai-title-trigger"
        onClick={() => setIsOpen(true)}
        disabled={!!disabledReason}
        title={disabledReason}
      >
        AI
      </button>

      {isOpen && (
        <div className="stl-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}>
          <div className="stl-modal stl-ai-title-modal">
            <div className="stl-ai-title-modal-header">
              <h3>Improve Title with AI</h3>
              <button
                type="button"
                className="stl-ai-title-modal-close"
                onClick={handleClose}
                disabled={isGenerating}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="stl-ai-title-preview">
              <span className="stl-ai-title-preview-label">Current title</span>
              <p className="stl-ai-title-preview-text">{currentTitle}</p>
            </div>

            <label className="stl-field" style={{ marginTop: '0.75rem' }}>
              <span>How should we improve it?</span>
              <textarea
                rows={3}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    void handleGenerate()
                  }
                }}
                placeholder="e.g. make it punchier, improve the SEO, add specificity about the neighborhood..."
                disabled={isGenerating}
              />
            </label>

            {phase.kind === 'error' && (
              <p className="stl-error stl-ai-title-error">{phase.message}</p>
            )}

            {phase.kind === 'done' && (
              <div className="stl-ai-title-preview" style={{ marginTop: '0.75rem' }}>
                <span className="stl-ai-title-preview-label">Improved title</span>
                <p className="stl-ai-title-preview-text">{phase.title}</p>
              </div>
            )}

            <div className="stl-inline-actions stl-ai-title-actions">
              {phase.kind !== 'done' ? (
                <button
                  type="button"
                  className="stl-btn"
                  onClick={() => void handleGenerate()}
                  disabled={isGenerating}
                >
                  {isGenerating ? 'Improving...' : 'Improve'}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="stl-btn stl-btn-success"
                    onClick={handleApply}
                  >
                    Use This Title
                  </button>
                  <button
                    type="button"
                    className="stl-btn stl-btn-secondary"
                    onClick={() => setPhase({ kind: 'idle' })}
                  >
                    Try Again
                  </button>
                </>
              )}
              <button
                type="button"
                className="stl-btn stl-btn-secondary"
                onClick={handleClose}
                disabled={isGenerating}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
