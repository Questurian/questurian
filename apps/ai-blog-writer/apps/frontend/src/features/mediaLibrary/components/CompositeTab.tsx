import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchLocations } from '../../../shared/api/payload/payload.api'
import { CompositeImageModal } from '../../../shared/images/components/CompositeImageModal'
import {
  cleanupHangingComposites,
  fetchHangingComposites,
} from '../../../shared/images/api/composites/composite-image.api'


function HangingCompositesPanel() {
  const queryClient = useQueryClient()
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['hanging-composites'],
    queryFn: () => fetchHangingComposites(),
  })

  const cleanup = useMutation({
    mutationFn: (mediaSetIds: number[]) => cleanupHangingComposites(mediaSetIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hanging-composites'] })
      queryClient.invalidateQueries({ queryKey: ['media-library'] })
    },
  })

  const hanging = data?.hanging ?? []

  return (
    <section className="ml-hanging">
      <div className="ml-hanging-header">
        <h4 className="ml-hanging-title">Hanging composites</h4>
        <button
          type="button"
          className="ml-page-btn"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          {isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      <p className="ml-orphans-hint">
        Composite MediaSets left incomplete by a failed upload (fewer than 7 variants). Deleting
        one removes the MediaSet and its uploaded variant files.
      </p>

      {isLoading && <p className="ml-count">Scanning…</p>}
      {isError && <p className="ml-hanging-error">Failed to scan for hanging composites.</p>}

      {!isLoading && !isError && hanging.length === 0 && (
        <div className="ml-audit-empty">
          <span>🎉 No hanging composites — nothing to clean up.</span>
        </div>
      )}

      {hanging.length > 0 && (
        <>
          <div className="ml-hanging-toolbar">
            <span className="ml-count">{hanging.length} hanging composite(s)</span>
            <button
              type="button"
              className="ml-bulk-btn"
              disabled={cleanup.isPending}
              onClick={() => cleanup.mutate(hanging.map((h) => h.mediaSetId))}
            >
              {cleanup.isPending ? 'Deleting…' : `Delete all (${hanging.length})`}
            </button>
          </div>

          <ul className="ml-hanging-list">
            {hanging.map((item) => (
              <li key={item.mediaSetId} className="ml-hanging-row">
                <div className="ml-hanging-media">
                  {item.previewUrl ? (
                    <img src={item.previewUrl} alt="" loading="lazy" />
                  ) : (
                    <span className="ml-audit-no-thumb">—</span>
                  )}
                </div>
                <div className="ml-hanging-copy">
                  <strong>{item.title}</strong>
                  <span className="ml-count">
                    {item.variantCount}/{item.expectedVariants} variants · #{item.mediaSetId}
                    {item.createdAt ? ` · ${new Date(item.createdAt).toLocaleDateString()}` : ''}
                  </span>
                </div>
                <button
                  type="button"
                  className="ml-page-btn"
                  disabled={cleanup.isPending}
                  onClick={() => cleanup.mutate([item.mediaSetId])}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {cleanup.isError && (
        <p className="ml-hanging-error">
          {cleanup.error instanceof Error ? cleanup.error.message : 'Cleanup failed'}
        </p>
      )}
      {cleanup.isSuccess && cleanup.data.deletedCount > 0 && (
        <p className="ml-upload-success">Removed {cleanup.data.deletedCount} hanging composite(s).</p>
      )}
    </section>
  )
}

export function CompositeTab() {
  const [locationRef, setLocationRef] = useState<number | null>(null)
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const { data: locationsData } = useQuery({
    queryKey: ['locations'],
    queryFn: () => fetchLocations(),
  })
  const locations = locationsData?.docs ?? []

  return (
    <div className="ml-composite">
      <div className="ml-composite-panel">
        <label className="ml-field-label">
          Location
          <select
            className="ml-field-input"
            value={locationRef ?? ''}
            onChange={(event) => setLocationRef(event.target.value ? Number(event.target.value) : null)}
          >
            <option value="">No location</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.neighborhood
                  ? `${location.neighborhood}, ${location.city}`
                  : location.city
                    ? `${location.city}, ${location.country}`
                    : location.country}
              </option>
            ))}
          </select>
        </label>

        <button type="button" className="ml-save-btn" onClick={() => setOpen(true)}>
          Create composite
        </button>

        {result && <p className="ml-upload-success">{result}</p>}

        <HangingCompositesPanel />
      </div>

      <CompositeImageModal
        isOpen={open}
        locationRef={locationRef}
        defaultTitle="Composite image"
        onCreated={(response) => setResult(`MediaSet #${response.mediaSetId} created.`)}
        onClose={() => setOpen(false)}
      />
    </div>
  )
}
