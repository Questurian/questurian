import { Panel } from './Panel'

interface SeoConstraintsPanelProps {
  mustInclude: string
  primaryKeyword: string
  secondaryKeywords: string
  onClear: () => void
  onMustIncludeChange: (value: string) => void
  onPrimaryKeywordChange: (value: string) => void
  onSecondaryKeywordsChange: (value: string) => void
}

export function SeoConstraintsPanel(props: SeoConstraintsPanelProps) {
  return <Panel
    title="SEO + Constraints"
    description="Set only requirements the finished draft must obey."
    onClear={props.onClear}
  >
      <div className="p2b-field"><label htmlFor="p2b-primary-kw">Primary Keyword</label><input id="p2b-primary-kw" type="text" className="p2b-input" value={props.primaryKeyword} onChange={event => props.onPrimaryKeywordChange(event.target.value)} /></div>
      <div className="p2b-field"><label htmlFor="p2b-must-include">Must Include (one per line)</label><textarea id="p2b-must-include" className="p2b-textarea" rows={3} value={props.mustInclude} onChange={event => props.onMustIncludeChange(event.target.value)} /></div>
      <details className="p2b-disclosure">
        <summary className="p2b-disclosure-summary">
          <span>Advanced SEO controls</span>
          <span className="p2b-disclosure-summary-hint">Add supporting phrases only when required</span>
        </summary>
        <div className="p2b-disclosure-body">
          <div className="p2b-field"><label htmlFor="p2b-secondary-kws">Secondary Keywords (comma-separated)</label><input id="p2b-secondary-kws" type="text" className="p2b-input" value={props.secondaryKeywords} onChange={event => props.onSecondaryKeywordsChange(event.target.value)} /></div>
        </div>
      </details>
  </Panel>
}
