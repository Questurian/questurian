import { useState } from 'react'
import type { MediaAsset } from '../../../shared/api/payload/payload.types'
import { useOrphanMediaAssets } from '../hooks/useMediaSets'


export function OrphansTab() {
  const [page, setPage] = useState(1)
  const { data, isLoading, isError } = useOrphanMediaAssets(page)

  const assets: MediaAsset[] = data?.docs ?? []
  const totalPages = data?.totalPages ?? 1
  const totalDocs = data?.totalDocs ?? 0

  if (isLoading) return <div className="ml-loading-full">Loading orphans…</div>
  if (isError) return <div className="ml-error-full">Failed to load orphaned assets</div>

  return (
    <div className="ml-orphans">
      <div className="ml-orphans-header">
        <p className="ml-count">{totalDocs} MediaAssets with no MediaSet</p>
        <p className="ml-orphans-hint">
          These uploaded files are not linked to any MediaSet. They won&apos;t appear in public
          content but still occupy storage. Assign them to a MediaSet in Payload admin, or
          delete them if no longer needed.
        </p>
      </div>

      {assets.length === 0 ? (
        <div className="ml-audit-empty">
          <span>🎉 No orphaned assets — every file belongs to a MediaSet!</span>
        </div>
      ) : (
        <table className="ml-audit-table">
          <thead>
            <tr>
              <th>Preview</th>
              <th>Filename</th>
              <th>Variant</th>
              <th>Dimensions</th>
              <th>Alt text</th>
              <th>Uploaded</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((asset) => (
              <tr key={asset.id} className="ml-audit-row">
                <td>
                  {asset.url ? (
                    <img className="ml-audit-thumb" src={asset.url} alt="" loading="lazy" />
                  ) : (
                    <span className="ml-audit-no-thumb">—</span>
                  )}
                </td>
                <td className="ml-audit-title">
                  <a
                    href={asset.url ?? '#'}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-orphan-link"
                  >
                    {asset.filename}
                  </a>
                </td>
                <td>{asset.variant ?? <span className="ml-missing">none</span>}</td>
                <td>
                  {asset.width && asset.height
                    ? `${asset.width}×${asset.height}`
                    : '—'}
                </td>
                <td>
                  {asset.alt_text ? (
                    <span className="ml-orphan-alt">{asset.alt_text}</span>
                  ) : (
                    <span className="ml-missing">missing</span>
                  )}
                </td>
                <td className="ml-audit-date">
                  {asset.createdAt ? new Date(asset.createdAt).toLocaleDateString() : '—'}
                </td>
              </tr>
            ))}
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
  )
}
