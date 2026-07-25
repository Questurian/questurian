import { Link } from 'react-router-dom'
import type { StagedArticle } from '../../types'

type StandardArticleStageHeroProps = {
  stagedArticle: StagedArticle
  eyebrow: string
  description: string
  backLabel: string
  stagePath: string
  completionPercent: number
  isSynced: boolean
  onDelete: () => void
}

export function StandardArticleStageHero({
  stagedArticle,
  eyebrow,
  description,
  backLabel,
  stagePath,
  completionPercent,
  isSynced,
  onDelete,
}: StandardArticleStageHeroProps) {
  return (
    <header className="stl-hero sab-stage-hero">
      <div>
        <p className="stl-eyebrow">{eyebrow}</p>
        <h1>{stagedArticle.payloadArticleId ? `Sync Draft #${stagedArticle.payloadArticleId}` : 'Stage Article'}</h1>
        <p className="stl-lede">{description}</p>
        <div className="sab-stage-hero-meta">
          {stagedArticle.originalType ? <span className="sab-stage-pill">{stagedArticle.originalType}</span> : null}
          {stagedArticle.payloadArticleId ? <span className="sab-stage-pill">Linked Payload #{stagedArticle.payloadArticleId}</span> : null}
          {!isSynced ? <span className="sab-stage-pill">{completionPercent}% ready</span> : null}
        </div>
      </div>
      <div className="stl-hero-actions">
        <Link to={stagePath} className="stl-btn stl-btn-secondary">{backLabel}</Link>
        <button type="button" className="stl-btn stl-btn-danger" onClick={onDelete}>
          Delete Staged Article
        </button>
      </div>
    </header>
  )
}
