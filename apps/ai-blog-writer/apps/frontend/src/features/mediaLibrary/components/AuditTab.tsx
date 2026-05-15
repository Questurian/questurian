import { useState } from 'react'
import type { MediaSet, MediaSetPatch } from '../../../shared/api/payload/payload.types'
import { useAuditMediaSets } from '../hooks/useMediaSets'
import { useUpdateMediaSet } from '../hooks/useUpdateMediaSet'
import { computeHealth } from './HealthScore'
import { HealthScore } from './HealthScore'
import { MediaSetSidePanel } from './MediaSetSidePanel'
import { generateAltTextFromUrl } from '../api/mediaLibraryApi'

type Props = { token: string }

function getSourceUrl(ms: MediaSet): string | null {
  if (ms.source && typeof ms.source === 'object' && ms.source.url) return ms.source.url
  const variants = ms.variants
  if (!variants) return null
  for (const key of ['hero', 'wide', 'editorial', 'square', 'portrait', 'thumbnail', 'open_graph'] as const) {
    const v = variants[key]
    if (v && typeof v === 'object' && v.url) return v.url
  }
  return null
}

export function AuditTab({ token }: Props) {
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<MediaSet | null>(null)
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set())
  const [bulkGenerating, setBulkGenerating] = useState(false)
  const [bulkProgress, setBulkProgress] = useState('')

  const { data, isLoading, isError, refetch } = useAuditMediaSets(token, page)
  const updateMutation = useUpdateMediaSet(token)

  const mediaSets = data?.docs ?? []
  const totalPages = data?.totalPages ?? 1
  const totalDocs = data?.totalDocs ?? 0

  const allChecked = mediaSets.length > 0 && mediaSets.every((ms) => checkedIds.has(ms.id))

  const toggleAll = () => {
    if (allChecked) {
      setCheckedIds(new Set())
    } else {
      setCheckedIds(new Set(mediaSets.map((ms) => ms.id)))
    }
  }

  const toggle = (id: number) => {
    setCheckedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleSave = async (patch: MediaSetPatch) => {
    if (!selected) return
    await updateMutation.mutateAsync({ id: selected.id, patch })
  }

  const handleBulkAltText = async () => {
    const targets = mediaSets.filter(
      (ms) => checkedIds.has(ms.id) && !ms.alt_text?.trim(),
    )
    if (targets.length === 0) return

    setBulkGenerating(true)
    let done = 0

    for (const ms of targets) {
      const url = getSourceUrl(ms)
      if (!url) { done++; continue }
      try {
        setBulkProgress(`Generating ${done + 1} of ${targets.length}…`)
        const text = await generateAltTextFromUrl(url, token)
        await updateMutation.mutateAsync({ id: ms.id, patch: { alt_text: text } })
      } catch {
        // skip failures silently; they'll remain in audit
      }
      done++
    }

    setBulkGenerating(false)
    setBulkProgress('')
    refetch()
  }

  if (isLoading) return <div className="ml-loading-full">Loading audit data…</div>
  if (isError) return <div className="ml-error-full">Failed to load audit data</div>

  return (
    <div className={`ml-audit ${selected ? 'with-panel' : ''}`}>
      <div className="ml-audit-main">
        <div className="ml-audit-toolbar">
          <span className="ml-count">
            {totalDocs} MediaSets with missing fields
          </span>
          {checkedIds.size > 0 && (
            <button
              type="button"
              className="ml-bulk-btn"
              onClick={handleBulkAltText}
              disabled={bulkGenerating}
            >
              {bulkGenerating
                ? bulkProgress
                : `✨ Generate alt text (${checkedIds.size} selected)`}
            </button>
          )}
        </div>

        {mediaSets.length === 0 ? (
          <div className="ml-audit-empty">
            <span>🎉 No issues found — all MediaSets are complete!</span>
          </div>
        ) : (
          <table className="ml-audit-table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={toggleAll}
                    aria-label="Select all"
                  />
                </th>
                <th>Preview</th>
                <th>Title</th>
                <th>Health</th>
                <th>Missing</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {mediaSets.map((ms) => {
                const health = computeHealth(ms)
                const previewUrl = getSourceUrl(ms)
                const missing = [
                  health.missingTitle && 'title',
                  health.missingAltText && 'alt text',
                  health.missingPhotographerCredit && 'credit',
                  health.missingLocation && 'location',
                ]
                  .filter(Boolean)
                  .join(', ')

                return (
                  <tr
                    key={ms.id}
                    className={`ml-audit-row ${selected?.id === ms.id ? 'active' : ''}`}
                    onClick={() => setSelected(selected?.id === ms.id ? null : ms)}
                  >
                    <td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={checkedIds.has(ms.id)}
                        onChange={() => toggle(ms.id)}
                        aria-label={`Select ${ms.title ?? ms.id}`}
                      />
                    </td>
                    <td>
                      {previewUrl ? (
                        <img className="ml-audit-thumb" src={previewUrl} alt="" loading="lazy" />
                      ) : (
                        <span className="ml-audit-no-thumb">—</span>
                      )}
                    </td>
                    <td className="ml-audit-title">
                      {ms.title || <span className="ml-missing">Untitled</span>}
                    </td>
                    <td>
                      <HealthScore health={health} size="sm" />
                    </td>
                    <td className="ml-audit-missing">{missing}</td>
                    <td className="ml-audit-date">
                      {ms.updatedAt ? new Date(ms.updatedAt).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {totalPages > 1 && (
          <div className="ml-pagination">
            <button type="button" className="ml-page-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              ← Prev
            </button>
            <span className="ml-page-info">{page} / {totalPages}</span>
            <button type="button" className="ml-page-btn" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next →
            </button>
          </div>
        )}
      </div>

      {selected && (
        <MediaSetSidePanel
          mediaSet={selected}
          health={computeHealth(selected)}
          token={token}
          onSave={handleSave}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
