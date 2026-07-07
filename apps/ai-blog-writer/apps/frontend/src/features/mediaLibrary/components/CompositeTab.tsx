import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchLocations } from '../../../shared/api/payload/payload.api'
import { CompositeImageModal } from '../../../shared/images/components/CompositeImageModal'

type Props = { token: string }

export function CompositeTab({ token }: Props) {
  const [locationRef, setLocationRef] = useState<number | null>(null)
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const { data: locationsData } = useQuery({
    queryKey: ['locations'],
    queryFn: () => fetchLocations(token),
    enabled: !!token,
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
      </div>

      <CompositeImageModal
        isOpen={open}
        token={token}
        locationRef={locationRef}
        defaultTitle="Composite image"
        onCreated={(response) => setResult(`MediaSet #${response.mediaSetId} created.`)}
        onClose={() => setOpen(false)}
      />
    </div>
  )
}
