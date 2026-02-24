import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../../providers/useAuth'
import { fetchItineraries } from '../api'
import { formatMinutes, toMinutesFromMidnight } from '../time'
import type { PayloadItineraryDoc } from '../types'
import '../styles.css'

function formatDate(value?: string): string {
  if (!value) return 'Unknown'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatWindow(doc: PayloadItineraryDoc): string {
  if (
    typeof doc.itineraryStartHour !== 'number' ||
    !doc.itineraryStartMinute ||
    !doc.itineraryStartPeriod ||
    typeof doc.itineraryEndHour !== 'number' ||
    !doc.itineraryEndMinute ||
    !doc.itineraryEndPeriod
  ) {
    return '-'
  }

  try {
    const start = toMinutesFromMidnight(doc.itineraryStartHour, doc.itineraryStartMinute, doc.itineraryStartPeriod)
    const end = toMinutesFromMidnight(doc.itineraryEndHour, doc.itineraryEndMinute, doc.itineraryEndPeriod)
    return `${formatMinutes(start)}-${formatMinutes(end)}`
  } catch {
    return '-'
  }
}

export default function ListicleItinerariesPage() {
  const { token } = useAuth()
  const [itineraries, setItineraries] = useState<PayloadItineraryDoc[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return

    let cancelled = false
    setIsLoading(true)
    setError(null)

    fetchItineraries(token)
      .then((response) => {
        if (cancelled) return
        setItineraries(response.docs || [])
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load itineraries')
      })
      .finally(() => {
        if (cancelled) return
        setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [token])

  const rows = useMemo(() => {
    return itineraries.map((doc) => ({
      id: doc.id,
      title: doc.title || 'Untitled',
      location: doc.location || '-',
      dayAudience: doc.dayAudience || '-',
      window: formatWindow(doc),
      status: doc.status || 'draft',
      updatedAt: formatDate(doc.updatedAt),
    }))
  }, [itineraries])

  return (
    <div className="stl-page">
      <header className="stl-hero">
        <div>
          <p className="stl-eyebrow">Questurian Studio</p>
          <h1>Listicle Itineraries</h1>
          <p className="stl-lede">
            Build and maintain Payload listicle-itinerary articles with full field and block control.
          </p>
        </div>
        <div className="stl-hero-actions">
          <Link className="stl-btn stl-btn-secondary" to="/">
            Back Home
          </Link>
          <Link className="stl-btn" to="/listicle-itineraries/builder">
            New Itinerary
          </Link>
        </div>
      </header>

      <section className="stl-panel">
        <div className="stl-panel-header">
          <h2>Payload Documents ({rows.length})</h2>
        </div>

        {isLoading ? <p className="stl-placeholder">Loading itineraries...</p> : null}
        {error ? <p className="stl-error">{error}</p> : null}

        {!isLoading && !error ? (
          rows.length === 0 ? (
            <div className="stl-empty">
              <p>No listicle-itineraries found.</p>
              <p>Create one to start building this format in the app.</p>
            </div>
          ) : (
            <div className="stl-table-wrap">
              <table className="stl-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Location</th>
                    <th>Day Type</th>
                    <th>Window</th>
                    <th>Status</th>
                    <th>Updated</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.title}</td>
                      <td>{row.location}</td>
                      <td>{row.dayAudience}</td>
                      <td>{row.window}</td>
                      <td>
                        <span className={`stl-status stl-status-${row.status}`}>{row.status}</span>
                      </td>
                      <td>{row.updatedAt}</td>
                      <td>
                        <Link className="stl-link" to={`/listicle-itineraries/builder?id=${row.id}`}>
                          Edit
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}
      </section>
    </div>
  )
}
