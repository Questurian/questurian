import type { Prompt2BlogArticleTypeOption } from '../../api'

interface CoreInputsPanelProps {
  articleGoal: string
  articleTypeId: number | null
  destinationContext: string
  groupedOptions: Array<{ label: string; options: Prompt2BlogArticleTypeOption[] }>
  quickPicks: Prompt2BlogArticleTypeOption[]
  selectedArticleType: Prompt2BlogArticleTypeOption | null
  targetReader: string
  onArticleGoalChange: (value: string) => void
  onArticleTypeChange: (value: number | null) => void
  onClear: () => void
  onDestinationContextChange: (value: string) => void
  onTargetReaderChange: (value: string) => void
}

export function CoreInputsPanel(props: CoreInputsPanelProps) {
  return <section className="p2b-panel">
    <div className="p2b-panel-header"><div className="p2b-panel-header-text"><h2>Core Inputs</h2><p>Select article type and provide intent/context.</p></div>
      <button type="button" className="p2b-section-clear-btn" onClick={props.onClear}>Clear section</button>
    </div>
    <div className="p2b-panel-body">
      <div className="p2b-field">
        <label htmlFor="p2b-article-type">Article Type</label>
        <select id="p2b-article-type" className="p2b-select" value={props.articleTypeId ?? ''} onChange={event => props.onArticleTypeChange(event.target.value ? Number(event.target.value) : null)}>
          <option value="">Select article type</option>
          {props.groupedOptions.map(group => <optgroup key={group.label} label={group.label}>{group.options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</optgroup>)}
        </select>
        {props.quickPicks.length > 0 && <div className="p2b-type-picker-meta"><span className="p2b-type-picker-label">Travel quick picks</span>
          <div className="p2b-type-chip-row" role="group" aria-label="Travel quick picks">
            {props.quickPicks.map(option => <button key={option.id} type="button" className={`p2b-type-chip${props.articleTypeId === option.id ? ' is-active' : ''}`} onClick={() => props.onArticleTypeChange(option.id)}>{option.name}</button>)}
          </div>
        </div>}
        <p className={`p2b-field-hint${props.selectedArticleType ? ' is-selected' : ''}`}>{props.selectedArticleType?.definition || 'Choose from travel-first groups or use a quick pick for common trip formats.'}</p>
      </div>
      <div className="p2b-field"><label htmlFor="p2b-goal">Article Goal</label><textarea id="p2b-goal" className="p2b-textarea" rows={2} value={props.articleGoal} onChange={event => props.onArticleGoalChange(event.target.value)} placeholder="What this article should help the reader accomplish" /></div>
      <div className="p2b-field-row p2b-field-row--2">
        <div className="p2b-field"><label htmlFor="p2b-target-reader">Target Reader</label><input id="p2b-target-reader" type="text" className="p2b-input" value={props.targetReader} onChange={event => props.onTargetReaderChange(event.target.value)} placeholder="Who this is written for" /></div>
        <div className="p2b-field"><label htmlFor="p2b-destination">Destination Context</label><input id="p2b-destination" type="text" className="p2b-input" value={props.destinationContext} onChange={event => props.onDestinationContextChange(event.target.value)} placeholder="City / region / country context" /></div>
      </div>
    </div>
  </section>
}
