import type {
  Prompt2BlogInputOptionsResponse,
  Prompt2BlogModelName,
  Prompt2BlogWriterModel,
} from '../../api'
import {
  PROMPT2BLOG_MODEL_OPTIONS,
  PROMPT2BLOG_WRITER_MODEL_OPTIONS,
  resolvePrompt2BlogModelName,
  resolvePrompt2BlogWriterModel,
} from '../../constants/prompt2blog.constants'
import type { P2BFormState } from '../composer.types'

const CREATIVITY_LEVELS = ['low', 'medium', 'high'] as const

function resolveCreativityLevel(value: string): P2BFormState['creativityLevel'] {
  return CREATIVITY_LEVELS.includes(value as P2BFormState['creativityLevel'])
    ? value as P2BFormState['creativityLevel']
    : 'medium'
}

interface PromptProfilesPanelProps {
  audienceProfile: string
  brandVoiceId: string
  creativityLevel: 'low' | 'medium' | 'high'
  enableEditorialAugmentation: boolean
  inputOptions: Prompt2BlogInputOptionsResponse | null
  lengthId: string
  modelName: Prompt2BlogModelName
  writingModel: Prompt2BlogWriterModel
  negativeInstructions: string
  promptEnhance: boolean
  toneId: string
  onChange: <K extends keyof P2BFormState>(field: K, value: P2BFormState[K]) => void
  onClear: () => void
}

export function PromptProfilesPanel(props: PromptProfilesPanelProps) {
  return <section className="p2b-panel">
    <div className="p2b-panel-header"><div className="p2b-panel-header-text"><h2>Prompt Profiles</h2><p>These dropdowns are loaded from markdown option catalogs.</p></div><button type="button" className="p2b-section-clear-btn" onClick={props.onClear}>Clear section</button></div>
    <div className="p2b-panel-body">
      <div className="p2b-field-row p2b-field-row--3">
        <SelectField id="p2b-tone" label="Tone" value={props.toneId} options={props.inputOptions?.tones || []} onChange={value => props.onChange('toneId', value)} />
        <SelectField id="p2b-length" label="Length" value={props.lengthId} options={props.inputOptions?.lengths || []} onChange={value => props.onChange('lengthId', value)} />
        <SelectField id="p2b-brand-voice" label="Brand Voice" value={props.brandVoiceId} options={props.inputOptions?.brand_voices || []} onChange={value => props.onChange('brandVoiceId', value)} />
      </div>
      <div className="p2b-field-row p2b-field-row--3">
        <div className="p2b-field"><label htmlFor="p2b-model">Base Draft Model</label><select id="p2b-model" className="p2b-select" value={props.modelName} onChange={event => props.onChange('modelName', resolvePrompt2BlogModelName(event.target.value))}>{PROMPT2BLOG_MODEL_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
        <div className="p2b-field"><label htmlFor="p2b-writer-model">Writer Model</label><select id="p2b-writer-model" className="p2b-select" value={props.writingModel} onChange={event => props.onChange('writingModel', resolvePrompt2BlogWriterModel(event.target.value))}>{PROMPT2BLOG_WRITER_MODEL_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
        <div className="p2b-field"><label htmlFor="p2b-creativity">Creativity Level</label><select id="p2b-creativity" className="p2b-select" value={props.creativityLevel} onChange={event => props.onChange('creativityLevel', resolveCreativityLevel(event.target.value))}>{CREATIVITY_LEVELS.map(level => <option key={level} value={level}>{level[0].toUpperCase()}{level.slice(1)}</option>)}</select></div>
        <div className="p2b-field"><label htmlFor="p2b-audience-profile">Audience Profile (Optional)</label><input id="p2b-audience-profile" type="text" className="p2b-input" value={props.audienceProfile} onChange={event => props.onChange('audienceProfile', event.target.value)} placeholder="Extra reader detail" /></div>
      </div>
      <div className="p2b-field"><label htmlFor="p2b-negative">Negative Instructions (one per line)</label><textarea id="p2b-negative" className="p2b-textarea" rows={3} value={props.negativeInstructions} onChange={event => props.onChange('negativeInstructions', event.target.value)} placeholder="What to avoid" /></div>
      <CheckboxField id="p2b-prompt-enhance" label="Prompt Enhance" checked={props.promptEnhance} onChange={checked => props.onChange('promptEnhance', checked)} />
      <CheckboxField id="p2b-editorial-toggle" label="Enable editorial augmentation" checked={props.enableEditorialAugmentation} onChange={checked => props.onChange('enableEditorialAugmentation', checked)} />
    </div>
  </section>
}

function SelectField({ id, label, value, options, onChange }: { id: string; label: string; value: string; options: Array<{ id: string; label: string }>; onChange: (value: string) => void }) {
  return <div className="p2b-field"><label htmlFor={id}>{label}</label><select id={id} className="p2b-select" value={value} onChange={event => onChange(event.target.value)}>{options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></div>
}

function CheckboxField({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="p2b-debug-checkbox" htmlFor={id}><input id={id} type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />{label}</label>
}
