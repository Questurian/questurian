import type {
  Prompt2BlogInputOption,
  Prompt2BlogInputOptionsResponse,
} from '../api'
import type { P2BFormState, RawBlob } from './composer.types'

export interface EasySetupImportMessage {
  field: string
  message: string
}

export interface EasySetupImportRow {
  field: string
  value: string
}

export interface EasySetupImportReview {
  issues: EasySetupImportMessage[]
  corrections: EasySetupImportMessage[]
  rows: EasySetupImportRow[]
  /**
   * The editorial direction the model committed to before filling anything
   * else. No form field carries it — it reaches the article through the fields
   * it shaped — so it is surfaced in full for the human to judge the brief by.
   */
  direction: string | null
  patch: Partial<P2BFormState> | null
}

const EXPECTED_KEYS = [
  'direction',
  'title',
  'location',
  'article_type',
  'article_goal',
  'target_reader',
  'destination_context',
  'angle',
  'call_to_action',
  'tone_id',
  'length_id',
  'brand_voice_id',
  'creativity_level',
  'primary_keyword',
  'secondary_keywords',
  'must_include',
  'negative_instructions',
  'enable_editorial_augmentation',
  'source_material',
  'model_name',
  'writing_model',
  'audit_model',
] as const

const CREATIVITY_LEVELS: Array<P2BFormState['creativityLevel']> = ['low', 'medium', 'high']
const SUMMARY_VALUE_LENGTH = 140

/**
 * Pulls the first balanced JSON object out of the pasted text so wrapping code
 * fences or a chat model's "here you go" preamble do not force a manual edit.
 * String contents are skipped, so braces inside values cannot end the object
 * early.
 */
function extractJsonText(raw: string): string | null {
  const start = raw.indexOf('{')
  if (start === -1) return null

  let depth = 0
  let inString = false
  let escaped = false

  for (let index = start; index < raw.length; index += 1) {
    const character = raw[index]
    if (inString) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') inString = false
      continue
    }
    if (character === '"') inString = true
    else if (character === '{') depth += 1
    else if (character === '}') {
      depth -= 1
      if (depth === 0) return raw.slice(start, index + 1)
    }
  }

  return null
}

/**
 * Folds the differences a model introduces without changing meaning — smart
 * quotes, dash variants, casing, padding — so "Beginner’s Guide" can still be
 * recognised as the catalog's "Beginner's Guide".
 */
function canonicalize(value: string): string {
  return value
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/[‐-―]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function levenshtein(left: string, right: string): number {
  if (left === right) return 0
  if (!left.length) return right.length
  if (!right.length) return left.length

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index)

  for (let row = 1; row <= left.length; row += 1) {
    const current = [row]
    for (let column = 1; column <= right.length; column += 1) {
      const substitution = previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1)
      current[column] = Math.min(substitution, previous[column] + 1, current[column - 1] + 1)
    }
    previous = current
  }

  return previous[right.length]
}

function closestValue(value: string, candidates: string[]): string | null {
  const target = canonicalize(value)
  let best: { candidate: string; distance: number } | null = null

  for (const candidate of candidates) {
    const distance = levenshtein(target, canonicalize(candidate))
    if (!best || distance < best.distance) best = { candidate, distance }
  }

  if (!best) return null
  const tolerance = Math.max(2, Math.round(target.length / 3))
  return best.distance <= tolerance ? best.candidate : null
}

function describeType(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'an array'
  if (typeof value === 'string') return value.trim() ? 'a string' : 'an empty string'
  return `a ${typeof value}`
}

/** Strips separators and casing so `callToAction` and `call_to_action` meet. */
function normalizeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9]/g, '').toLowerCase()
}

function acronym(key: string): string {
  return key
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map(word => word[0])
    .join('')
    .toLowerCase()
}

/**
 * Key mistakes look different from value mistakes: models abbreviate
 * (`cta`), shorten (`goal`), or re-case them, and plain edit distance misses
 * all three.
 */
function suggestKey(unknownKey: string, candidates: string[]): string | null {
  const normalized = normalizeKey(unknownKey)
  if (!normalized) return null

  const acronymMatch = candidates.find(candidate => acronym(candidate) === normalized)
  if (acronymMatch) return acronymMatch

  const containment = candidates.filter((candidate) => {
    const candidateKey = normalizeKey(candidate)
    return candidateKey.includes(normalized) || normalized.includes(candidateKey)
  })
  if (containment.length === 1) return containment[0]

  let best: { candidate: string; distance: number } | null = null
  for (const candidate of candidates) {
    const distance = levenshtein(normalized, normalizeKey(candidate))
    if (!best || distance < best.distance) best = { candidate, distance }
  }
  if (!best) return null
  const tolerance = Math.max(2, Math.round(normalizeKey(best.candidate).length / 3))
  return best.distance <= tolerance ? best.candidate : null
}

/**
 * A source block is the article's whole factual substrate — it is cleaned and
 * merged before the writer sees it, so a bare link or a one-line citation
 * contributes nothing. Counting the thin blocks makes that visible at review
 * time rather than after a run has produced a vague article.
 */
const THIN_SOURCE_LENGTH = 200

function describeSourceMaterial(sources: string[]): string {
  const parts = [`${sources.length} block${sources.length === 1 ? '' : 's'}`]
  const pending = sources.filter(source => /^research needed:/i.test(source.trim())).length
  const thin = sources.filter(
    source => !/^research needed:/i.test(source.trim()) && source.trim().length < THIN_SOURCE_LENGTH,
  ).length
  if (pending) parts.push(`${pending} still to research`)
  if (thin) parts.push(`${thin} thin`)
  return parts.join(' · ')
}

function truncate(value: string): string {
  const collapsed = value.replace(/\s+/g, ' ').trim()
  if (collapsed.length <= SUMMARY_VALUE_LENGTH) return collapsed
  return `${collapsed.slice(0, SUMMARY_VALUE_LENGTH - 1).trimEnd()}…`
}

export function reviewEasySetupJson(
  raw: string,
  inputOptions: Prompt2BlogInputOptionsResponse | null,
): EasySetupImportReview {
  const issues: EasySetupImportMessage[] = []
  const corrections: EasySetupImportMessage[] = []
  const rows: EasySetupImportRow[] = []
  let direction: string | null = null
  const empty = (): EasySetupImportReview => ({ issues, corrections, rows, direction, patch: null })

  if (!inputOptions?.article_types.length) {
    issues.push({
      field: 'options',
      message: 'Article types, tones, lengths, and brand voices have not loaded yet, so the '
        + 'pasted values cannot be checked against them.',
    })
    return empty()
  }

  if (!raw.trim()) {
    issues.push({ field: 'json', message: 'Paste the approved JSON first.' })
    return empty()
  }

  const jsonText = extractJsonText(raw)
  if (!jsonText) {
    issues.push({ field: 'json', message: 'No JSON object found. Paste the full { … } object.' })
    return empty()
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch (error) {
    issues.push({
      field: 'json',
      message: `Not valid JSON: ${error instanceof Error ? error.message : 'parse failed'}.`,
    })
    return empty()
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    issues.push({ field: 'json', message: 'The pasted value must be a single JSON object.' })
    return empty()
  }

  // Re-key the payload first: casing and separators carry no meaning, so
  // `callToAction` is the same field as `call_to_action`. Anything that does
  // not resolve to exactly one expected key stays unknown.
  const record: Record<string, unknown> = {}
  const unknownKeys: string[] = []
  const sourceKeys = new Map<string, string>()

  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    const normalized = normalizeKey(key)
    const expected = EXPECTED_KEYS.find(candidate => normalizeKey(candidate) === normalized)
    if (!expected) {
      unknownKeys.push(key)
      continue
    }
    const previous = sourceKeys.get(expected)
    if (previous !== undefined) {
      issues.push({
        field: expected,
        message: `Provided twice, as "${previous}" and "${key}". Keep one.`,
      })
      continue
    }
    sourceKeys.set(expected, key)
    if (expected !== key) corrections.push({ field: expected, message: `Read from "${key}".` })
    record[expected] = value
  }

  const missingKeys: string[] = []

  function readString(key: string, allowEmpty = false): string | null {
    if (!(key in record)) {
      missingKeys.push(key)
      issues.push({ field: key, message: 'Missing from the pasted JSON.' })
      return null
    }
    const value = record[key]
    if (typeof value !== 'string') {
      issues.push({ field: key, message: `Must be a string, received ${describeType(value)}.` })
      return null
    }
    const trimmed = value.trim()
    if (!trimmed && !allowEmpty) {
      issues.push({ field: key, message: 'Must not be empty.' })
      return null
    }
    return trimmed
  }

  function readStringArray(key: string): string[] | null {
    if (!(key in record)) {
      missingKeys.push(key)
      issues.push({ field: key, message: 'Missing from the pasted JSON.' })
      return null
    }
    const value = record[key]
    if (!Array.isArray(value)) {
      issues.push({ field: key, message: `Must be an array of strings, received ${describeType(value)}.` })
      return null
    }
    const nonString = value.find(item => typeof item !== 'string')
    if (nonString !== undefined) {
      issues.push({ field: key, message: `Every item must be a string, found ${describeType(nonString)}.` })
      return null
    }

    const items = (value as string[]).map(item => item.trim()).filter(Boolean)
    const unique: string[] = []
    const seen = new Set<string>()
    for (const item of items) {
      const fingerprint = canonicalize(item)
      if (seen.has(fingerprint)) continue
      seen.add(fingerprint)
      unique.push(item)
    }
    if (unique.length !== items.length) {
      corrections.push({
        field: key,
        message: `Removed ${items.length - unique.length} duplicate entr${items.length - unique.length === 1 ? 'y' : 'ies'}.`,
      })
    }
    return unique
  }

  function readBoolean(key: string): boolean | null {
    if (!(key in record)) {
      missingKeys.push(key)
      issues.push({ field: key, message: 'Missing from the pasted JSON.' })
      return null
    }
    const value = record[key]
    if (typeof value !== 'boolean') {
      issues.push({ field: key, message: `Must be true or false, received ${describeType(value)}.` })
      return null
    }
    return value
  }

  // Exact match wins; otherwise a value is only accepted when normalising it
  // lands on exactly one allowed value. Anything looser is reported, never
  // guessed at.
  function readAllowed(key: string, allowed: string[], aliases: Map<string, string>): string | null {
    const value = readString(key)
    if (value === null) return null

    if (allowed.includes(value)) return value

    const fingerprint = canonicalize(value)
    const canonicalMatches = allowed.filter(option => canonicalize(option) === fingerprint)
    if (canonicalMatches.length === 1) {
      corrections.push({ field: key, message: `Matched "${value}" to "${canonicalMatches[0]}".` })
      return canonicalMatches[0]
    }

    const alias = aliases.get(fingerprint)
    if (alias) {
      corrections.push({ field: key, message: `Matched "${value}" to "${alias}".` })
      return alias
    }

    const suggestion = closestValue(value, [...allowed, ...aliases.keys()])
    const resolved = suggestion ? aliases.get(canonicalize(suggestion)) ?? suggestion : null
    issues.push({
      field: key,
      message: `"${value}" is not one of the allowed values.${resolved ? ` Closest match: "${resolved}".` : ''}`,
    })
    return null
  }

  function catalogAliases(options: Prompt2BlogInputOption[]): Map<string, string> {
    // Models sometimes return the human label instead of the id; the mapping is
    // unambiguous, so accept it and say so.
    const aliases = new Map<string, string>()
    for (const option of options) {
      const label = canonicalize(option.label)
      if (!aliases.has(label)) aliases.set(label, option.id)
    }
    return aliases
  }

  // Read first so the direction is shown even when a later field fails review:
  // seeing what the model decided is what tells you whether to fix the JSON or
  // rerun the prompt.
  direction = readString('direction')
  const title = readString('title')
  const location = readString('location')
  const articleTypeName = readAllowed(
    'article_type',
    inputOptions.article_types.map(option => option.name),
    new Map(),
  )
  const articleGoal = readString('article_goal')
  const targetReader = readString('target_reader')
  const destinationContext = readString('destination_context')
  const angle = readString('angle', true)
  const callToAction = readString('call_to_action', true)
  const toneId = readAllowed(
    'tone_id',
    inputOptions.tones.map(option => option.id),
    catalogAliases(inputOptions.tones),
  )
  const lengthId = readAllowed(
    'length_id',
    inputOptions.lengths.map(option => option.id),
    catalogAliases(inputOptions.lengths),
  )
  const brandVoiceId = readAllowed(
    'brand_voice_id',
    inputOptions.brand_voices.map(option => option.id),
    catalogAliases(inputOptions.brand_voices),
  )
  const creativityLevel = readAllowed('creativity_level', CREATIVITY_LEVELS, new Map())
  const primaryKeyword = readString('primary_keyword', true)
  const secondaryKeywords = readStringArray('secondary_keywords')
  const mustInclude = readStringArray('must_include')
  const negativeInstructions = readStringArray('negative_instructions')
  const enableEditorialAugmentation = readBoolean('enable_editorial_augmentation')
  const sourceMaterial = readStringArray('source_material')
  // Older Easy Setup prompts included model routing. Accept those keys so a
  // saved brief remains usable, but keep routing under the operator's control.
  for (const key of ['model_name', 'writing_model', 'audit_model'] as const) {
    if (key in record) {
      corrections.push({
        field: key,
        message: 'Ignored. Choose this run setting in Run Stack.',
      })
    }
  }

  for (const key of unknownKeys) {
    const suggestion = suggestKey(key, missingKeys)
    issues.push({
      field: key,
      message: suggestion
        ? `Unexpected key. Did you mean "${suggestion}"?`
        : 'Unexpected key. Remove it before applying.',
    })
  }

  const articleType = articleTypeName
    ? inputOptions.article_types.find(option => option.name === articleTypeName)
    : undefined

  // Every reader above records an issue when it returns null, so this guard is
  // also what proves to the compiler that a clean review has complete values.
  if (
    issues.length
    || direction === null
    || title === null
    || location === null
    || !articleType
    || articleGoal === null
    || targetReader === null
    || destinationContext === null
    || angle === null
    || callToAction === null
    || toneId === null
    || lengthId === null
    || brandVoiceId === null
    || creativityLevel === null
    || primaryKeyword === null
    || secondaryKeywords === null
    || mustInclude === null
    || negativeInstructions === null
    || enableEditorialAugmentation === null
    || sourceMaterial === null
  ) {
    return empty()
  }

  const blobs: RawBlob[] = sourceMaterial.length
    ? sourceMaterial.map((content, index) => ({ id: index + 1, content }))
    : [{ id: 1, content: '' }]

  const patch: Partial<P2BFormState> = {
    easySetupTitle: title,
    easySetupLocation: location,
    articleTypeId: articleType.id,
    articleGoal,
    targetReader,
    destinationContext,
    angle,
    callToAction,
    toneId,
    lengthId,
    brandVoiceId,
    creativityLevel: creativityLevel as P2BFormState['creativityLevel'],
    primaryKeyword,
    secondaryKeywords: secondaryKeywords.join(', '),
    mustInclude: mustInclude.join('\n'),
    negativeInstructions: negativeInstructions.join('\n'),
    enableEditorialAugmentation,
    blobs,
  }

  const countLabel = (items: string[], noun: string) =>
    `${items.length} ${noun}${items.length === 1 ? '' : 's'}`

  rows.push(
    { field: 'Title', value: truncate(title) },
    { field: 'Location', value: truncate(location) },
    { field: 'Article Type', value: `${articleType.name} (id ${articleType.id})` },
    { field: 'Article Goal', value: truncate(articleGoal) },
    { field: 'Target Reader', value: truncate(targetReader) },
    { field: 'Destination Context', value: truncate(destinationContext) },
    { field: 'Angle', value: angle ? truncate(angle) : '—' },
    { field: 'Call to Action', value: callToAction ? truncate(callToAction) : '—' },
    { field: 'Tone', value: toneId },
    { field: 'Length', value: lengthId },
    { field: 'Brand Voice', value: brandVoiceId },
    { field: 'Creativity', value: creativityLevel },
    { field: 'Primary Keyword', value: primaryKeyword ? truncate(primaryKeyword) : '—' },
    { field: 'Secondary Keywords', value: secondaryKeywords.length ? truncate(secondaryKeywords.join(', ')) : '—' },
    { field: 'Must Include', value: countLabel(mustInclude, 'item') },
    { field: 'Negative Instructions', value: countLabel(negativeInstructions, 'item') },
    { field: 'Editorial Extras', value: enableEditorialAugmentation ? 'On' : 'Off' },
    { field: 'Source Material', value: describeSourceMaterial(sourceMaterial) },
  )

  return { issues, corrections, rows, direction, patch }
}
