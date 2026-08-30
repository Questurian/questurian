import type { Prompt2BlogInputOption, Prompt2BlogInputOptionsResponse } from '../../api'
import {
  creativityReachesWriter,
  DEFAULT_PROMPT2BLOG_MODEL_STACK_ID,
} from '../../constants/prompt2blog.constants'
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
  inputOptions: Prompt2BlogInputOptionsResponse | null
  lengthId: string
  toneId: string
  onChange: <K extends keyof P2BFormState>(field: K, value: P2BFormState[K]) => void
  onClear: () => void
}

export function PromptProfilesPanel(props: PromptProfilesPanelProps) {
  const creativityAppliesToWriter = creativityReachesWriter(
    DEFAULT_PROMPT2BLOG_MODEL_STACK_ID,
  )
  return <Panel
    title="Writing Profiles"
    description="Tone, brand voice, and creativity for the approved commission."
    onClear={props.onClear}
  >
      <div className="p2b-field-row p2b-field-row--2">
        <SelectField id="p2b-tone" label="Tone" value={props.toneId} options={props.inputOptions?.tones || []} onChange={value => props.onChange('toneId', value)} />
        <SelectField id="p2b-brand-voice" label="Brand Voice" value={props.brandVoiceId} options={props.inputOptions?.brand_voices || []} onChange={value => props.onChange('brandVoiceId', value)} />
      </div>
      <LengthRecap lengthId={props.lengthId} inputOptions={props.inputOptions} />
      <details className="p2b-disclosure">
        <summary className="p2b-disclosure-summary">
          <span>Advanced generation controls</span>
          <span className="p2b-disclosure-summary-hint">Creativity and optional steering</span>
        </summary>
        <div className="p2b-disclosure-body">
          <div className="p2b-field"><label htmlFor="p2b-creativity">Creativity Level</label><select id="p2b-creativity" className="p2b-select" value={props.creativityLevel} onChange={event => props.onChange('creativityLevel', resolveCreativityLevel(event.target.value))}>{CREATIVITY_LEVELS.map(level => <option key={level} value={level}>{level[0].toUpperCase()}{level.slice(1)}</option>)}</select>{creativityAppliesToWriter ? null : (
            <p className="p2b-field-hint" data-testid="p2b-creativity-inert">
              Not applied on the current article route. Creativity sets the
              writing model's sampling temperature, and the Claude plan
              transport has no temperature control, so this setting is recorded
              on the run but does not change the draft.
            </p>
          )}</div>
        </div>
      </details>
  </Panel>
}

/**
 * What was chosen in step 1, shown but not editable.
 *
 * Length stopped being a writing option when it started deciding how many
 * research questions get asked. Changing it here would leave the target and
 * the research that was sized for it disagreeing, silently.
 */
function LengthRecap({
  lengthId,
  inputOptions,
}: {
  lengthId: string
  inputOptions: Prompt2BlogInputOptionsResponse | null
}) {
  const length = inputOptions?.lengths.find(option => option.id === lengthId)
  if (!length) return null
  return <p className="p2b-field-hint" data-testid="p2b-length-recap">
    Length: <strong>{length.label}</strong>
    {length.target_word_count ? `, about ${length.target_word_count} words` : ''}. Set
    in step 1, because it decided how many questions the research had to answer.
    Change it there if you need a different length.
  </p>
}

function SelectField({ id, label, value, options, onChange }: { id: string; label: string; value: string; options: Prompt2BlogInputOption[]; onChange: (value: string) => void }) {
  const selected = options.find(option => option.id === value)
  return <div className="p2b-field">
    <label htmlFor={id}>{label}</label>
    <select id={id} className="p2b-select" value={value} onChange={event => onChange(event.target.value)}>{options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select>
    {selected ? <ProfileReader kind={label} profile={selected} /> : null}
  </div>
}

function ProfileReader({
  kind,
  profile,
}: {
  kind: string
  profile: Prompt2BlogInputOption
}) {
  const paragraphs = (profile.instructions || '')
    .split(/\n\s*\n/)
    .map(paragraph => paragraph.trim())
    .filter(paragraph => paragraph && !paragraph.startsWith('#'))

  return <div
    className="p2b-profile-reader"
    aria-label={`${kind}: ${profile.label} profile`}
    aria-live="polite"
  >
    <strong>{profile.label}</strong>
    {profile.description ? <p>{profile.description}</p> : null}
    {paragraphs.length ? (
      <details>
        <summary>Read full {kind.toLowerCase()} profile</summary>
        <div className="p2b-profile-reader-rules">
          {paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        </div>
      </details>
    ) : null}
  </div>
}
