import type { ReactNode } from 'react'

interface PanelProps {
  children: ReactNode
  description: string
  title: string
  onClear?: () => void
}

export function Panel({ children, description, title, onClear }: PanelProps) {
  return <section className="p2b-panel">
    <div className="p2b-panel-header">
      <div className="p2b-panel-header-text">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {onClear && <button type="button" className="p2b-section-clear-btn" onClick={onClear}>Clear section</button>}
    </div>
    <div className="p2b-panel-body">{children}</div>
  </section>
}
