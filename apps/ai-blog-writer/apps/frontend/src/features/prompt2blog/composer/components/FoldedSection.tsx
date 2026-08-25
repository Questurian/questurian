import type { ReactNode } from 'react'

interface FoldedSectionProps {
  title: string
  description: string
  children: ReactNode
}

/**
 * A section the operator opens only when they want it.
 *
 * Named for what it does rather than where it sits: it used to be the one fold
 * in the middle of the page, and it is now what keeps model routing out of the
 * way of the work.
 */
export function FoldedSection({ title, description, children }: FoldedSectionProps) {
  return <section className="p2b-middle-fold-panel">
    <details className="p2b-middle-fold">
      <summary className="p2b-middle-fold-summary">
        <div className="p2b-panel-header-text">
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <span className="p2b-middle-fold-chevron" aria-hidden="true" />
      </summary>
      <div className="p2b-middle-fold-content">{children}</div>
    </details>
  </section>
}
