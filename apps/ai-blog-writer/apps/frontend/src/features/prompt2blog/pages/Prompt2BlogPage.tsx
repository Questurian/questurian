import { Link } from 'react-router-dom'
import { BriefScreen } from '../intake/components/BriefScreen'
import { GateScreen } from '../intake/components/GateScreen'
import { GrillScreen } from '../intake/components/GrillScreen'
import { ArticleScreen } from '../intake/components/ArticleScreen'
import { ResearchScreen } from '../intake/components/ResearchScreen'
import { WorkingScreen } from '../intake/components/WorkingScreen'
import { SeedScreen } from '../intake/components/SeedScreen'
import { WorkOrderScreen } from '../intake/components/WorkOrderScreen'
import { useIntake } from '../intake/useIntake'

/**
 * Starting an article.
 *
 * One screen at a time, in the order the work actually happens: say what you
 * want to write about, answer a few questions, approve the brief, cut the
 * research plan.
 *
 * There is no form. The old page asked for a title, a location, a tone, a brand
 * voice, a creativity level and a direction card before it would do anything,
 * and never once asked what the article was for.
 */
const STEP_LABELS: Record<string, string> = {
  seed: 'Starting',
  grill: 'A few questions',
  brief: 'The brief',
  work_order: 'The research plan',
  research: 'What we found',
}

export function Prompt2BlogPage() {
  const intake = useIntake()
  const state = intake.state
  const step = state?.step ?? 'seed'
  const writing = state?.writing ?? null
  // Once the graph owns the run there is nothing left to decide here, so the
  // intake screens step aside rather than offering buttons that would queue a
  // second article on the same run.
  const handedToTheWriter = writing !== null

  return (
    <div className="p2b-page">
      <header className="p2b-hero">
        <div>
          <p className="p2b-eyebrow">Questurian Studio</p>
          <h1>
            Write something worth <span className="p2b-underline-text">reading</span>
            <span className="p2b-dot">.</span>
          </h1>
        </div>
        <div className="p2b-badge-row">
          <Link to="/" className="p2b-nav-link">
            &larr; Home
          </Link>
          <Link to="/prompt2blog/articles" className="p2b-nav-link">
            Saved Articles
          </Link>
        </div>
      </header>

      <main className="p2b-form-container">
        {state && (
          // Always here, at the top, whatever has or has not gone wrong. The
          // run is remembered so a closed tab can resume, which means a run
          // that cannot move forward would trap the page on every reload.
          <div className="p2b-intake-bar">
            <span className="p2b-intake-step">{STEP_LABELS[step]}</span>
            {/* On screen so a run can be returned to. Every stage of it lives
                on the server, so `?run=<id>` reopens it exactly where it
                stopped — which is what makes an agreed grill a checkpoint you
                can retest the rest of the pipeline from. */}
            <code className="p2b-run-id" title="Reopen with ?run=<id>">
              {state.run_id}
            </code>
            <button type="button" onClick={intake.abandon}>
              Start over
            </button>
          </div>
        )}

        {intake.error && (
          <div className="p2b-error" role="alert">
            <p>{intake.error}</p>
          </div>
        )}

        {handedToTheWriter ? (
          writing.state === 'running' ? (
            <WorkingScreen writing={writing} />
          ) : (
            <ArticleScreen
              runId={state!.run_id}
              writing={writing}
              article={intake.article}
              onReopen={intake.reopen}
              busy={intake.busy}
            />
          )
        ) : intake.busy && step === 'work_order' ? (
          // Research: ten sequential searches, five to ten minutes, and the
          // screen used to say nothing at all for the whole of it.
          <WorkingScreen research={state?.research_progress} />
        ) : (
          <>
        {step === 'seed' && <SeedScreen busy={intake.busy} onStart={intake.start} />}

        {step === 'grill' && state?.grill && (
          <GrillScreen
            grill={state.grill}
            busy={intake.busy}
            onAnswer={intake.answer}
            onApprove={intake.approveBrief}
            onReopen={intake.reopen}
          />
        )}

        {step === 'brief' && state?.brief && (
          <BriefScreen
            brief={state.brief}
            busy={intake.busy}
            onPlanResearch={intake.planResearch}
            onReopen={intake.reopen}
          />
        )}

        {step === 'work_order' && state?.work_order && (
          <WorkOrderScreen
            workOrder={state.work_order}
            warnings={intake.cutWarnings}
            busy={intake.busy}
            onCut={intake.cut}
            onReopen={intake.reopen}
            onResearch={intake.research}
          />
        )}

        {step === 'research' &&
          state?.research &&
          // A blocked run used to show the verdict and one way out, back to
          // the grill, which discards research already paid for. The gate
          // screen settles the questions in place instead.
          (state.research.coverage.can_write ? (
            <ResearchScreen
              runId={state.run_id}
              research={state.research}
              busy={intake.busy}
              onWrite={intake.write}
              onReopen={intake.reopen}
              onChanged={intake.refresh}
            />
          ) : (
            <GateScreen
              runId={state.run_id}
              onSettled={intake.refresh}
              onReopen={intake.reopen}
              busy={intake.busy}
            />
          ))}
          </>
        )}
      </main>
    </div>
  )
}

export default Prompt2BlogPage
