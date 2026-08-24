import type { Prompt2BlogInputOptionsResponse } from '../../api'
import type { P2BFormState } from '../composer.types'
import { Panel } from './Panel'

const CREATIVITY_LEVELS = ['low', 'medium', 'high'] as const

function resolveCreativityLevel(value: string): P2BFormState['creativityLevel'] {
  return CREATIVITY_LEVELS.includes(value as P2BFormState['creativityLevel'])
    ? value as P2BFormState['creativityLevel']
    : 'medium'
}

interface PromptProfilesPanelProps {
  brandVoiceId: string
  creativityLevel: 'low' | 'medium' | 'high'
  enableEditorialAugmentation: boolean
  inputOptions: Prompt2BlogInputOptionsResponse | null
  lengthId: string
  negativeInstructions: string
  toneId: string
  onChange: <K extends keyof P2BFormState>(field: K, value: P2BFormState[K]) => void
  onClear: () => void
}

export function PromptProfilesPanel(props: PromptProfilesPanelProps) {
  return <Panel
    title="Prompt Profiles"
    description="These dropdowns are loaded from markdown option catalogs."
    onClear={props.onClear}
  >
      <div className="p2b-field-row p2b-field-row--3">
        <SelectField id="p2b-tone" label="Tone" value={props.toneId} options={props.inputOptions?.tones || []} onChange={value => props.onChange('toneId', value)} />
        <SelectField id="p2b-length" label="Length" value={props.lengthId} options={props.inputOptions?.lengths || []} onChange={value => props.onChange('lengthId', value)} />
        <SelectField id="p2b-brand-voice" label="Brand Voice" value={props.brandVoiceId} options={props.inputOptions?.brand_voices || []} onChange={value => props.onChange('brandVoiceId', value)} />
      </div>
      <details className="p2b-disclosure">
        <summary className="p2b-disclosure-summary">
          <span>Advanced generation controls</span>
          <span className="p2b-disclosure-summary-hint">Creativity and optional steering</span>
        </summary>
        <div className="p2b-disclosure-body">
          <div className="p2b-field"><label htmlFor="p2b-creativity">Creativity Level</label><select id="p2b-creativity" className="p2b-select" value={props.creativityLevel} onChange={event => props.onChange('creativityLevel', resolveCreativityLevel(event.target.value))}>{CREATIVITY_LEVELS.map(level => <option key={level} value={level}>{level[0].toUpperCase()}{level.slice(1)}</option>)}</select></div>
          <div className="p2b-field"><label htmlFor="p2b-negative">Negative Instructions (one per line)</label><textarea id="p2b-negative" className="p2b-textarea" rows={3} value={props.negativeInstructions} onChange={event => props.onChange('negativeInstructions', event.target.value)} placeholder="What to avoid" /></div>
          <div className="p2b-checkbox-stack">
            <div className="p2b-checkbox-option">
              <label className="p2b-debug-checkbox" htmlFor="p2b-editorial-toggle">
                <input
                  id="p2b-editorial-toggle"
                  type="checkbox"
                  checked={props.enableEditorialAugmentation}
                  onChange={event => props.onChange('enableEditorialAugmentation', event.target.checked)}
                />
                Add editorial extras
              </label>
              <p className="p2b-field-hint">May add a useful pull quote, callout, FAQ, or takeaway box.</p>
            </div>
          </div>
        </div>
      </details>
  </Panel>
}

function SelectField({ id, label, value, options, onChange }: { id: string; label: string; value: string; options: Array<{ id: string; label: string; description?: string }>; onChange: (value: string) => void }) {
  // The catalogs carry a description per option explaining when to pick it.
  // Rendering only the label meant that routing was invisible at the point of
  // choice, which is the only place it is any use.
  const selected = options.find(option => option.id === value)
  return <div className="p2b-field">
    <label htmlFor={id}>{label}</label>
    <select id={id} className="p2b-select" value={value} onChange={event => onChange(event.target.value)}>{options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select>
    {selected?.description && <p className="p2b-field-hint is-selected">{selected.description}</p>}
  </div>
}
