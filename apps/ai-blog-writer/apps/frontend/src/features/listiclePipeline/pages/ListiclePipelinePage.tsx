import { Link, useNavigate, useParams } from 'react-router-dom'
import { GrillScreen } from '../components/GrillScreen'
import { OrderPanel } from '../components/OrderPanel'
import { SearchResults } from '../components/SearchResults'
import { SeedScreen } from '../components/SeedScreen'
import { useListicleGrill } from '../useListicleGrill'
import { useEffect } from 'react'
import '../styles.css'

/**
 * The listicle pipeline's front door.
 *
 * A section of its own rather than a mode of Prompt2Blog. The two commission
 * different things: an article is judged on whether it reads well, which is
 * arguable and was never provable; a listicle is judged on whether every item
 * is real, current and earns its place against a stated standard, which is
 * checkable. Different definitions of success do not share a spine.
 *
 * The run id is in the URL. That is what makes a run survivable: the interview
 * and the searches were always stored on the server, and the only thing that
 * was not was the operator's way back to them -- a refresh landed on an empty
 * seed box with a paid, agreed, searched run in the database and no route to
 * it. A link now reaches a run, and a reload reads it rather than starting
 * again.
 *
 * Nothing after the searches is built: there is no evidence check, no gate, no
 * list. Said on the screen so nobody opening this mistakes a pool of
 * candidates for a finished listicle.
 */

export function ListiclePipelinePage() {
  const { runId } = useParams<{ runId: string }>()
  const navigate = useNavigate()
  const grill = useListicleGrill(runId ?? null)
  const { state, order, results, busy, searching, loading, missing, error } = grill

  // A run that has just been created gets its own address. Done here rather
  // than inside the hook so the hook stays a data concern and the routing
  // stays a page one.
  useEffect(() => {
    if (state && state.run_id !== runId) {
      navigate(`/listicle-pipeline/${state.run_id}`, { replace: !runId })
    }
  }, [navigate, runId, state])

  return (
    <div className="lp-page">
      <header className="lp-hero">
        <div>
          <p className="lp-eyebrow">Questurian Studio</p>
          <h1>
            Build a <span className="lp-underline-text">list</span>
            <span className="lp-dot">.</span>
          </h1>
        </div>
        <div className="lp-badge-row">
          <Link to="/" className="lp-nav-link">
            &larr; Home
          </Link>
          <Link to="/single-type-listicles" className="lp-nav-link">
            Manual builder
          </Link>
        </div>
      </header>

      <main className="lp-container">
        <p className="lp-scaffold-banner" role="status">
          <strong>Interview and search.</strong> The interview settles the search
          order and the searches return candidate places. Checking each one has
          enough published material to write about is not built yet.
        </p>

        {state && (
          <div className="lp-step-bar">
            <span className="lp-step">
              {state.status === 'agreed' ? 'Settled' : 'A few questions'}
            </span>
            {/* On screen and in the address bar: an interview lives on the run,
                not in this tab, and this link is how it is returned to. */}
            <span className="lp-run-id">run {state.run_id}</span>
          </div>
        )}

        {error && (
          <p className="lp-error" role="alert">
            {error}
          </p>
        )}

        {/* Three states that used to look identical, and are not: reading an
            existing run, a run that is not there, and no run at all. Offering
            a fresh seed box while the third is still unknown is how an
            operator starts a second interview for a run they already had. */}
        {loading ? (
          <p className="lp-muted" role="status">
            Opening run {runId}…
          </p>
        ) : missing ? (
          <div className="lp-actions">
            <p className="lp-error" role="alert">
              There is no run with the id <strong>{runId}</strong>.
            </p>
            <button
              type="button"
              onClick={() => {
                grill.reset()
                navigate('/listicle-pipeline')
              }}
            >
              Start a new list
            </button>
          </div>
        ) : state === null ? (
          <SeedScreen busy={busy} onStart={grill.start} />
        ) : (
          <>
            <GrillScreen
              state={state}
              busy={busy}
              onAnswer={grill.answer}
              onReset={() => {
                grill.reset()
                navigate('/listicle-pipeline')
              }}
            />

            {/* The agreement, as a record rather than as a paragraph. On
                screen before anything is spent, because the only real run of
                this pipeline showed twenty and searched for forty. */}
            {state.status === 'agreed' && order && (
              <OrderPanel
                order={order}
                busy={busy || searching}
                onCorrectCount={grill.correctCount}
                onCorrectRequirements={grill.correctRequirements}
              />
            )}

            {/* Offered only once the order is settled, and only as a button:
                several grounded searches take minutes and cost real tokens, so
                nothing starts them except someone asking. */}
            {state.status === 'agreed' && results === null && (
              <div className="lp-actions lp-search-cta">
                <button
                  type="button"
                  onClick={() => grill.search()}
                  disabled={searching}
                >
                  {searching ? 'Searching the web…' : 'Run the searches'}
                </button>
                {searching && (
                  <p className="lp-muted">
                    One search per angle. This takes a few minutes. Each one is
                    saved as it finishes, so a failure part way through does not
                    lose the rest.
                  </p>
                )}
              </div>
            )}

            {results && (
              <SearchResults
                results={results}
                busy={searching}
                onRun={grill.search}
                onRecheck={grill.recheck}
              />
            )}
          </>
        )}
      </main>
    </div>
  )
}
