import type { Dispatch, SetStateAction } from 'react'
import type { SeoMetadataForm } from '../../types'

type SeoMetadataModalProps = {
  isOpen: boolean
  mode: 'create' | 'edit'
  form: SeoMetadataForm
  isSaving: boolean
  mediaAssets: Array<{ id: number; filename: string }>
  setForm: Dispatch<SetStateAction<SeoMetadataForm>>
  onSave: () => Promise<void>
  onClose: () => void
}

export function SeoMetadataModal({
  isOpen,
  mode,
  form,
  isSaving,
  mediaAssets,
  setForm,
  onSave,
  onClose,
}: SeoMetadataModalProps) {
  if (!isOpen) return null

  return (
    <div className="stl-modal-overlay">
      <div className="stl-modal">
        <h3>{mode === 'create' ? 'Create SEO Metadata' : 'Edit SEO Metadata'}</h3>
        <div className="stl-grid stl-grid-2">
          <label className="stl-field">
            <span>Meta Title</span>
            <input value={form.metaTitle} onChange={(event) => setForm((prev) => ({ ...prev, metaTitle: event.target.value }))} />
          </label>
          <label className="stl-field">
            <span>Keywords</span>
            <input value={form.keywords} onChange={(event) => setForm((prev) => ({ ...prev, keywords: event.target.value }))} />
          </label>
          <label className="stl-field">
            <span>OG Title</span>
            <input value={form.ogTitle} onChange={(event) => setForm((prev) => ({ ...prev, ogTitle: event.target.value }))} />
          </label>
          <label className="stl-field">
            <span>Canonical URL</span>
            <input value={form.canonicalUrl} onChange={(event) => setForm((prev) => ({ ...prev, canonicalUrl: event.target.value }))} />
          </label>
          <label className="stl-field">
            <span>OG Image</span>
            <select
              value={form.ogImage || ''}
              onChange={(event) => setForm((prev) => ({ ...prev, ogImage: event.target.value ? Number(event.target.value) : null }))}
            >
              <option value="">None</option>
              {mediaAssets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  #{asset.id} {asset.filename}
                </option>
              ))}
            </select>
          </label>
          <label className="stl-field">
            <span>Status</span>
            <select
              value={form.status}
              onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as 'draft' | 'published' }))}
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </label>
        </div>

        <label className="stl-field">
          <span>Meta Description</span>
          <textarea rows={3} value={form.metaDescription} onChange={(event) => setForm((prev) => ({ ...prev, metaDescription: event.target.value }))} />
        </label>

        <label className="stl-field">
          <span>OG Description</span>
          <textarea rows={3} value={form.ogDescription} onChange={(event) => setForm((prev) => ({ ...prev, ogDescription: event.target.value }))} />
        </label>

        <div className="stl-inline-actions">
          <label className="stl-checkbox">
            <input type="checkbox" checked={form.noIndex} onChange={(event) => setForm((prev) => ({ ...prev, noIndex: event.target.checked }))} />
            <span>No Index</span>
          </label>
          <label className="stl-checkbox">
            <input
              type="checkbox"
              checked={form.noFollow}
              onChange={(event) => setForm((prev) => ({ ...prev, noFollow: event.target.checked }))}
            />
            <span>No Follow</span>
          </label>
        </div>

        <div className="stl-inline-actions">
          <button type="button" className="stl-btn" disabled={isSaving} onClick={() => void onSave()}>
            {isSaving ? 'Saving...' : 'Save SEO'}
          </button>
          <button type="button" className="stl-btn stl-btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
