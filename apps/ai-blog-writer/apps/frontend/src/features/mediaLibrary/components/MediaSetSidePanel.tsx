import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ArticleTag, Location, MediaSet, MediaSetPatch } from '../../../shared/api/payload/payload.types'
import { fetchArticleTags, fetchLocations } from '../../../shared/api/payload/payload.api'
import type { AltTextGenerationState, MediaSetHealth } from '../types'
import { HealthScore } from './HealthScore'
import { VariantCompleteness } from './VariantCompleteness'
import { generateAltTextFromUrl } from '../api/mediaLibraryApi'

type Props = {
  mediaSet: MediaSet
  health: MediaSetHealth
  onSave: (patch: MediaSetPatch) => Promise<void>
  onClose: () => void
}

function getSourceUrl(ms: MediaSet): string | null {
  const source = ms.source
  if (source && typeof source === 'object' && source.url) return source.url

  const variants = ms.variants
  if (!variants) return null
  for (const key of ['hero', 'wide', 'editorial', 'square', 'portrait', 'thumbnail', 'open_graph'] as const) {
    const v = variants[key]
    if (v && typeof v === 'object' && v.url) return v.url
  }
  return null
}

export function MediaSetSidePanel({ mediaSet, health, onSave, onClose }: Props) {
  const [form, setForm] = useState<MediaSetPatch>({
    title: mediaSet.title ?? '',
    alt_text: mediaSet.alt_text ?? '',
    photographer_credit: mediaSet.photographer_credit ?? '',
    location: typeof mediaSet.location === 'object' && mediaSet.location
      ? (mediaSet.location as Location).id
      : (mediaSet.location as number | null | undefined) ?? null,
    location_finalized: mediaSet.location_finalized ?? false,
    tags: [],
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [altGen, setAltGen] = useState<AltTextGenerationState>({ status: 'idle', text: '' })

  const { data: tagsData } = useQuery({
    queryKey: ['article-tags'],
    queryFn: () => fetchArticleTags({ limit: 200 }),
  })

  const { data: locationsData } = useQuery({
    queryKey: ['locations'],
    queryFn: () => fetchLocations(),
  })

  const tags: ArticleTag[] = tagsData?.docs ?? []
  const locations: Location[] = locationsData?.docs ?? []

  useEffect(() => {
    const existingTagIds = (mediaSet.tags ?? [])
      .map((t) => (typeof t === 'object' ? t.id : t))
      .filter(Boolean) as number[]

    setForm({
      title: mediaSet.title ?? '',
      alt_text: mediaSet.alt_text ?? '',
      photographer_credit: mediaSet.photographer_credit ?? '',
      location: typeof mediaSet.location === 'object' && mediaSet.location
        ? (mediaSet.location as Location).id
        : (mediaSet.location as number | null | undefined) ?? null,
      location_finalized: mediaSet.location_finalized ?? false,
      tags: existingTagIds,
    })
    setSaved(false)
    // Deliberately keyed on identity only. This effect seeds the edit form from
    // the selected media set, so it must run when the selection changes and at
    // no other time. Adding the mediaSet.* fields the linter asks for would
    // re-seed on every refetch of the same record — overwriting whatever the
    // user has typed but not saved, and clearing the "Saved" confirmation the
    // moment the post-save refetch lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaSet.id])

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    try {
      await onSave(form)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const handleGenerateAltText = async () => {
    const url = getSourceUrl(mediaSet)
    if (!url) return
    setAltGen({ status: 'generating', text: '' })
    try {
      const text = await generateAltTextFromUrl(url)
      setForm((f) => ({ ...f, alt_text: text }))
      setAltGen({ status: 'done', text })
    } catch (err) {
      setAltGen({ status: 'error', text: String(err) })
    }
  }

  const toggleTag = (id: number) => {
    setForm((f) => ({
      ...f,
      tags: f.tags?.includes(id)
        ? f.tags.filter((t) => t !== id)
        : [...(f.tags ?? []), id],
    }))
  }

  const sourceUrl = getSourceUrl(mediaSet)

  return (
    <aside className="ml-side-panel">
      <div className="ml-side-panel-header">
        <span className="ml-side-panel-id">#{mediaSet.id}</span>
        <HealthScore health={health} size="md" />
        <button type="button" className="ml-side-panel-close" onClick={onClose} aria-label="Close panel">
          ✕
        </button>
      </div>

      {sourceUrl && (
        <div className="ml-side-panel-preview">
          <img src={sourceUrl} alt={mediaSet.alt_text ?? 'Preview'} />
        </div>
      )}

      <div className="ml-side-panel-variants">
        <VariantCompleteness health={health} />
      </div>

      <div className="ml-side-panel-form">
        <label className="ml-field-label">
          Title
          <input
            className="ml-field-input"
            type="text"
            value={form.title ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Short label for admin display"
          />
        </label>

        <label className="ml-field-label">
          Alt text
          <div className="ml-field-row">
            <textarea
              className="ml-field-input ml-field-textarea"
              value={form.alt_text ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, alt_text: e.target.value }))}
              placeholder="Describe the image for screen readers"
              rows={3}
            />
            {sourceUrl && (
              <button
                type="button"
                className="ml-ai-btn"
                onClick={handleGenerateAltText}
                disabled={altGen.status === 'generating'}
                title="Generate with AI"
              >
                {altGen.status === 'generating' ? '⏳' : '✨'}
              </button>
            )}
          </div>
          {altGen.status === 'error' && (
            <span className="ml-field-error">{altGen.text}</span>
          )}
        </label>

        <label className="ml-field-label">
          Photographer credit
          <input
            className="ml-field-input"
            type="text"
            value={form.photographer_credit ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, photographer_credit: e.target.value }))}
            placeholder="Photographer name or source"
          />
        </label>

        <label className="ml-field-label">
          Location
          <select
            className="ml-field-input"
            value={form.location ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, location: e.target.value ? Number(e.target.value) : null }))}
          >
            <option value="">— none —</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.neighborhood
                  ? `${l.neighborhood}, ${l.city}`
                  : l.city
                  ? `${l.city}, ${l.country}`
                  : l.country}
              </option>
            ))}
          </select>
        </label>

        <label className="ml-field-label ml-field-checkbox-label">
          <input
            type="checkbox"
            checked={!!form.location_finalized}
            onChange={(e) => setForm((f) => ({ ...f, location_finalized: e.target.checked }))}
          />
          Location finalized
        </label>

        <div className="ml-field-label">
          Tags
          <div className="ml-tag-picker">
            {tags.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`ml-tag-chip ${form.tags?.includes(t.id) ? 'active' : ''}`}
                onClick={() => toggleTag(t.id)}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="ml-side-panel-footer">
        <button
          type="button"
          className="ml-save-btn"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save changes'}
        </button>
      </div>
    </aside>
  )
}
