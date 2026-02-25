import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../../providers/useAuth'
import { fetchListicles } from '../api'
import type { PayloadListicleDoc } from '../types'
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

export default function SingleTypeListiclesPage() {
  const { token } = useAuth()
  const [listicles, setListicles] = useState<PayloadListicleDoc[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return

    let cancelled = false
    setIsLoading(true)
    setError(null)

    fetchListicles(token)
      .then((response) => {
        if (cancelled) return
        setListicles(response.docs || [])
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load listicles')
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
    return listicles.map((doc) => ({
      id: doc.id,
      title: doc.title || 'Untitled',
      location: doc.location || '-',
      type: doc.listicleType || '-',
      target: doc.targetItemCount ?? '-',
      status: doc.status || 'draft',
      updatedAt: formatDate(doc.updatedAt),
    }))
  }, [listicles])

  return (
    <div className="stl-page">
      <header className="stl-hero">
        <div>
          <p className="stl-eyebrow">Questurian Studio</p>
          <h1>Single Type Listicles</h1>
          <p className="stl-lede">
            Build and maintain Payload single-type-listicle articles with AI-assisted block editing.
          </p>
        </div>
        <div className="stl-hero-actions">
          <Link className="stl-btn stl-btn-secondary" to="/">
            Back Home
          </Link>
          <Link className="stl-btn" to="/single-type-listicles/builder">
            New Listicle
          </Link>
        </div>
      </header>

      <section className="stl-panel">
        <div className="stl-panel-header">
          <h2>Payload Documents ({rows.length})</h2>
        </div>

        {isLoading ? <p className="stl-placeholder">Loading listicles...</p> : null}
        {error ? <p className="stl-error">{error}</p> : null}

        {!isLoading && !error ? (
          rows.length === 0 ? (
            <div className="stl-empty">
              <p>No single-type-listicles found.</p>
              <p>Create one to start building this format in the app.</p>
            </div>
          ) : (
            <div className="stl-table-wrap">
              <table className="stl-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Location</th>
                    <th>Type</th>
                    <th>Target</th>
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
                      <td>{row.type}</td>
                      <td>{row.target}</td>
                      <td>
                        <span className={`stl-status stl-status-${row.status}`}>{row.status}</span>
                      </td>
                      <td>{row.updatedAt}</td>
                      <td>
                        <Link
                          className="stl-link"
                          to={`/single-type-listicles/builder?id=${row.id}`}
                        >
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
