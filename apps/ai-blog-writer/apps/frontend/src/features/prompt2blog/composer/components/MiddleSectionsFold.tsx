import type { ReactNode } from 'react'

export function MiddleSectionsFold({ children }: { children: ReactNode }) {
  return <section className="p2b-middle-fold-panel">
    <details className="p2b-middle-fold">
      <summary className="p2b-middle-fold-summary">
        <div className="p2b-panel-header-text">
          <h2>Article Details</h2>
          <p>Core inputs, prompt profiles, SEO, source material, and guidelines.</p>
        </div>
        <span className="p2b-middle-fold-chevron" aria-hidden="true" />
      </summary>
      <div className="p2b-middle-fold-content">{children}</div>
    </details>
  </section>
}
