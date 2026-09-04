import { Link } from 'react-router-dom'
import { GrillScreen } from '../components/GrillScreen'
import { SearchResults } from '../components/SearchResults'
import { SeedScreen } from '../components/SeedScreen'
import { useListicleGrill } from '../useListicleGrill'
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
 * Its own screen treatment is deliberate too — the operator should be able to
 * tell at a glance which one they are in.
 *
 * Right now this is the shell and nothing else: no run, no server, no model,
 * no research. The grill walks a hardcoded placeholder script so the shape can
 * be looked at and argued with before anything is built underneath it.
 */

export function ListiclePipelinePage() {
  const grill = useListicleGrill()
  const { state, results, busy, searching, error } = grill

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
        {/* The interview runs, and stops when the specification is full.
            Nothing after it is built: there is no research, no gate, no list.
            Said on the screen so nobody opening this mistakes an agreed
            interview for a finished listicle. */}
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
            {/* On screen so an interview can be returned to: it lives on the
                run, not in this tab. */}
            <span className="lp-run-id">run {state.run_id}</span>
          </div>
        )}

        {error && (
          <p className="lp-error" role="alert">
            {error}
          </p>
        )}

        {state === null ? (
          <SeedScreen busy={busy} onStart={grill.start} />
        ) : (
          <>
            <GrillScreen
              state={state}
              busy={busy}
              onAnswer={grill.answer}
              onReset={grill.reset}
            />

            {/* Offered only once the order is settled, and only as a button:
                seven grounded searches take minutes and cost real tokens, so
                nothing starts them except someone asking. */}
            {state.status === 'agreed' && results === null && (
              <div className="lp-actions lp-search-cta">
                <button type="button" onClick={grill.search} disabled={searching}>
                  {searching ? 'Searching the web…' : 'Run the searches'}
                </button>
                {searching && (
                  <p className="lp-muted">
                    One search per angle. This takes a few minutes.
                  </p>
                )}
              </div>
            )}

            {results && (
              <SearchResults results={results} busy={searching} onRerun={grill.search} />
            )}
          </>
        )}
      </main>
    </div>
  )
}
