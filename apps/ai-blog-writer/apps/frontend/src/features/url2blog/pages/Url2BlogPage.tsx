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
        {run.currentStep === 'input' && <RunFormPanel run={run} />}
        {run.currentStep === 'processing' && <ProcessingPanel run={run} />}
        {run.currentStep === 'complete' && run.result && (
          <ResultsPanel result={run.result} onStartOver={run.handleStartOver} />
        )}
      </main>
    </div>
  )
}
