import type { Dispatch, SetStateAction } from 'react'
import type { ListicleItineraryDraft, SeoMetadataOption } from '../../types'

type BuilderSeoPanelProps = {
  draft: ListicleItineraryDraft
  seoOptions: SeoMetadataOption[]
  onOpenCreateSeoModal: () => void
  onOpenEditSeoModal: () => void
  setDraft: Dispatch<SetStateAction<ListicleItineraryDraft | null>>
}

export function BuilderSeoPanel({
  draft,
  seoOptions,
  onOpenCreateSeoModal,
  onOpenEditSeoModal,
  setDraft,
}: BuilderSeoPanelProps) {
  return (
    <section className="stl-panel">
      <div className="stl-panel-header">
        <h2>
          <span className="stl-kicker">Step 4</span> SEO & Metadata
        </h2>
        <div className="stl-inline-actions">
          <button type="button" className="stl-btn" onClick={onOpenCreateSeoModal}>
            Create SEO
          </button>
          <button type="button" className="stl-btn stl-btn-secondary" onClick={onOpenEditSeoModal}>
            Edit Selected SEO
          </button>
        </div>
      </div>

      <label className="stl-field">
        <span>SEO Metadata Relationship</span>
        <select
          value={draft.seoSection.seo || ''}
          onChange={(event) =>
            setDraft((current) => {
              if (!current) return current
              return {
                ...current,
                seoSection: {
                  seo: event.target.value ? Number(event.target.value) : null,
                },
              }
            })
          }
        >
          <option value="">None</option>
          {seoOptions.map((seo) => (
            <option key={seo.id} value={seo.id}>
              #{seo.id} {seo.metaTitle || '(untitled)'} [{seo.status || 'draft'}]
            </option>
          ))}
        </select>
      </label>
    </section>
  )
}
