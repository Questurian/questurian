import { AlertTriangle, CircleAlert } from 'lucide-react'
import type { Issue } from '../validation'

/**
 * What is stopping you, listed once, each line linking to the control it is
 * about.
 *
 * Shown only after a blocked action, never while typing — the reason a fresh
 * form does not open covered in red. Colour carries nothing: every line has an
 * icon and a word.
 */

export interface ErrorSummaryProps {
  issues: Issue[]
  heading: string
  onGoTo: (issue: Issue) => void
}

export function ErrorSummary({ issues, heading, onGoTo }: ErrorSummaryProps) {
  if (issues.length === 0) return null
  const errors = issues.filter(issue => issue.severity === 'error')
  const tone = errors.length > 0 ? 'error' : 'warning'

  return (
    <div className={`ip-summary ip-summary-${tone}`} role="alert" tabIndex={-1} data-ip-summary>
      <p className="ip-summary-heading">
        {tone === 'error' ? <CircleAlert size={16} aria-hidden /> : <AlertTriangle size={16} aria-hidden />}
        <span>{heading}</span>
      </p>
      <ul className="ip-summary-list">
        {issues.map(issue => (
          <li key={issue.id}>
            <button type="button" className="ip-link-button" onClick={() => onGoTo(issue)}>
              {issue.message}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
