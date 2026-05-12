import { Link } from 'react-router-dom'

type BuilderHeroProps = {
  eyebrow: string
  newTitle: string
  payloadId?: number
  lede: string
  backHref: string
  onDiscardLocalDraft: () => void
}

export function BuilderHero({
  eyebrow,
  newTitle,
  payloadId,
  lede,
  backHref,
  onDiscardLocalDraft,
}: BuilderHeroProps) {
  return (
    <header className="stl-hero">
      <div>
        <p className="stl-eyebrow">{eyebrow}</p>
        <h1>{payloadId ? `Edit #${payloadId}` : newTitle}</h1>
        <p className="stl-lede">{lede}</p>
      </div>
      <div className="stl-hero-actions">
        <Link to={backHref} className="stl-btn stl-btn-secondary">
          Back to List
        </Link>
        <button type="button" className="stl-btn stl-btn-danger" onClick={onDiscardLocalDraft}>
          Discard Local Draft
        </button>
      </div>
    </header>
  )
}
