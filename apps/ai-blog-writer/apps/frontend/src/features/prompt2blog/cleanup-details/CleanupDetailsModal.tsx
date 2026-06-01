import type { Prompt2BlogCleanupStageData } from './cleanup-stage.types'

interface CleanupDetailsModalProps {
  data: Prompt2BlogCleanupStageData | null
  error: string | null
  loading: boolean
  onClose: () => void
}

export function CleanupDetailsModal({ data, error, loading, onClose }: CleanupDetailsModalProps) {
  const fallbackCount = data ? data.sources.filter(source => source.fallbackUsed).length : 0
  return (
    <div className="p2b-modal-overlay" onClick={event => event.target === event.currentTarget && onClose()}>
      <div className="p2b-modal" role="dialog" aria-modal="true" aria-label="Clean source material details">
        <div className="p2b-modal__header">
          <div>
            <p className="p2b-modal__eyebrow">{data?.cleanupMode ? 'AI Cleanup Stage' : 'Local Cleanup Stage'}</p>
            <h3>Clean source material</h3>
            <p className="p2b-modal__lede">
              {data?.cleanupMode
                ? 'This stage uses aggressive AI cleanup to strip promotional clutter, footer/legal blocks, and embedded CTAs while preserving source facts before synthesis.'
                : 'This step is local code, not AI. It strips markup, removes common noise, and normalizes whitespace before synthesis.'}
            </p>
          </div>
          <button type="button" className="p2b-modal__close" onClick={onClose} aria-label="Close cleanup details">×</button>
        </div>
        <div className="p2b-modal__body">
          {loading ? <p className="p2b-modal__empty">Loading cleanup details...</p>
            : error ? <p className="p2b-modal__error">{error}</p>
            : data ? <>
                <div className="p2b-cleanup-summary">
                  <SummaryCard label="Sources submitted" value={data.sourceMaterialCount} />
                  <SummaryCard label="Sources kept" value={data.cleanedSourcesCount} />
                  <SummaryCard label="Cleanup mode" value={data.cleanupMode || 'legacy_local'} />
                  <SummaryCard label="Model" value={data.modelName || 'N/A'} />
                  <SummaryCard label="Fallbacks used" value={fallbackCount} />
                </div>
                <div className="p2b-cleanup-source-list">
                  {data.sources.map(source => (
                    <section key={`cleanup-source-${source.sourceIndex}`} className="p2b-cleanup-source-card">
                      <div className="p2b-cleanup-source-card__header">
                        <div>
                          <div className="p2b-cleanup-source-card__title-row">
                            <h4>{source.title || `Source ${source.sourceIndex}`}</h4>
                            <span className={`p2b-cleanup-pill ${source.fallbackUsed ? 'p2b-cleanup-pill--fallback' : ''}`}>
                              {source.fallbackUsed ? 'Fallback used' : 'AI cleaned'}
                            </span>
                          </div>
                          <p>{source.publishedAt || 'No date detected'} {' · '} {source.cleanedChars.toLocaleString()} chars after cleanup</p>
                        </div>
                        <div className="p2b-cleanup-stats">
                          <span>Input: {source.inputChars.toLocaleString()}</span>
                          <span>Pre-clean: {source.precleanChars.toLocaleString()}</span>
                          <span>Output: {source.cleanedChars.toLocaleString()}</span>
                          <span>Removed blocks: {source.removedBlocks.length.toLocaleString()}</span>
                        </div>
                      </div>
                      <div className="p2b-cleanup-source-card__body">
                        {source.fallbackUsed && <p className="p2b-cleanup-source-card__note">AI cleanup failed for this source, so the pipeline used the deterministic pre-cleaned text instead.</p>}
                        {source.cleanedText ? <pre>{source.cleanedText}</pre> : <p className="p2b-modal__empty">No cleaned text was stored for this source.</p>}
                        <div className="p2b-cleanup-removed">
                          <h5>Removed blocks</h5>
                          {source.removedBlocks.length ? <div className="p2b-cleanup-removed-list">
                            {source.removedBlocks.map((block, index) => <article key={index} className="p2b-cleanup-removed-item">
                              <strong>{block.label}</strong>
                              <p className="p2b-cleanup-removed-item__reason">{block.reason}</p>
                              <p className="p2b-cleanup-removed-item__excerpt">{block.excerpt}</p>
                            </article>)}
                          </div> : <p className="p2b-modal__empty">{source.fallbackUsed
                            ? 'No removed-block breakdown is available for fallback cleanup.'
                            : 'No removed blocks were recorded for this source.'}</p>}
                        </div>
                      </div>
                    </section>
                  ))}
                </div>
              </>
            : <p className="p2b-modal__empty">Cleanup stage data is not available for this run yet.</p>}
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return <div className="p2b-cleanup-summary__card"><span>{label}</span><strong>{value}</strong></div>
}
