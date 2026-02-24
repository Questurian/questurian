import { Link } from 'react-router-dom'
import type { SingleTypeListicleDraft } from '../../types'

type BuilderHeroProps = {
  draft: SingleTypeListicleDraft
  onDiscardLocalDraft: () => void
}

export function BuilderHero({ draft, onDiscardLocalDraft }: BuilderHeroProps) {
  return (
    <header className="stl-hero">
      <div>
        <p className="stl-eyebrow">Single Type Listicle Builder</p>
        <h1>{draft.payloadId ? `Edit #${draft.payloadId}` : 'New Listicle'}</h1>
        <p className="stl-lede">Field-by-field and block-by-block editor for Payload `single-type-listicles`.</p>
      </div>
      <div className="stl-hero-actions">
        <Link to="/single-type-listicles" className="stl-btn stl-btn-secondary">
          Back to List
        </Link>
        <button type="button" className="stl-btn stl-btn-danger" onClick={onDiscardLocalDraft}>
          Discard Local Draft
        </button>
      </div>
    </header>
  )
}
