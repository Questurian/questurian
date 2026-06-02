import { HeroHeader } from '../components/HeroHeader'
import { ProcessingPanel } from '../components/ProcessingPanel'
import { ResultsPanel } from '../components/ResultsPanel'
import { RunFormPanel } from '../components/RunFormPanel'
import { useUrl2BlogRun } from '../hooks/useUrl2BlogRun'
import '../styles.css'

export default function Url2BlogPage() {
  const run = useUrl2BlogRun()

  return (
    <div className="url2blog-page">
      <HeroHeader />
      <main className="url2blog-wizard">
        {run.pipeline.currentStep === 'input' && <RunFormPanel run={run} />}
        {run.pipeline.currentStep === 'processing' && <ProcessingPanel run={run} />}
        {run.pipeline.currentStep === 'complete' && run.pipeline.result && (
          <ResultsPanel result={run.pipeline.result} onStartOver={run.pipeline.handleStartOver} />
        )}
      </main>
    </div>
  )
}
