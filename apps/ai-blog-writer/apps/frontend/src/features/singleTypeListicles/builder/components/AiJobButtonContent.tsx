type AiJobButtonContentProps = {
  isRunning: boolean
  isQueued: boolean
  idleLabel: string
  queuedLabel: string
  runningLabel: string
}

function SpinnerIcon() {
  return (
    <svg className="stl-btn-spinner" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
    </svg>
  )
}

function QueueIcon() {
  return (
    <svg className="stl-btn-queue-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M10 5.25v5l3 1.75" />
      <circle cx="10" cy="10" r="6.25" />
    </svg>
  )
}

export function AiJobButtonContent({
  isRunning,
  isQueued,
  idleLabel,
  queuedLabel,
  runningLabel,
}: AiJobButtonContentProps) {
  if (isRunning) {
    return (
      <span className="stl-btn-state">
        <SpinnerIcon />
        <span>{runningLabel}</span>
      </span>
    )
  }

  if (isQueued) {
    return (
      <span className="stl-btn-state">
        <QueueIcon />
        <span>{queuedLabel}</span>
      </span>
    )
  }

  return <>{idleLabel}</>
}
