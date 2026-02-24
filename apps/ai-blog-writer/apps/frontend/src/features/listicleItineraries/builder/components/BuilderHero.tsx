import { Link } from 'react-router-dom'

type BuilderHeroProps = {
  payloadId?: number
  onDiscardLocalDraft: () => void
}

export function BuilderHero({ payloadId, onDiscardLocalDraft }: BuilderHeroProps) {
  return (
    <header className="stl-hero">
      <div>
        <p className="stl-eyebrow">Listicle Itinerary Builder</p>
        <h1>{payloadId ? `Edit #${payloadId}` : 'New Itinerary'}</h1>
        <p className="stl-lede">Field-by-field and block-by-block editor for Payload `listicle-itineraries`.</p>
      </div>
      <div className="stl-hero-actions">
        <Link to="/listicle-itineraries" className="stl-btn stl-btn-secondary">
          Back to List
        </Link>
        <button type="button" className="stl-btn stl-btn-danger" onClick={onDiscardLocalDraft}>
          Discard Local Draft
        </button>
      </div>
    </header>
  )
}
