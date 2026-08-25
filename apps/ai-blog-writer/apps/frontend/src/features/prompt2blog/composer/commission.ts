import type {
  Prompt2BlogCommission,
  Prompt2BlogCommissionDraft,
  Prompt2BlogDirectionOption,
  Prompt2BlogEditorialOptionsResponse
} from '../api'
import {
  validateDirectionOption,
  type DirectionImportIssue
} from './direction-import'

const COMMISSION_KEYS = [
  'schema_version',
  'original_title',
  'location',
  'approved_direction',
  'form_id',
  'topic_module_ids',
  'audience',
  'core_reader_question',
  'reader_outcome',
  'primary_subject',
  'scope',
  'requirements',
  'exclusions',
  'call_to_action'
] as const

function copyDirectionOption(
  option: Prompt2BlogDirectionOption
): Prompt2BlogDirectionOption {
  return {
    ...option,
    topic_module_ids: [...option.topic_module_ids],
    audience: {
      ...option.audience,
      tags: [...(option.audience.tags ?? [])]
    },
    scope: {
      ...option.scope,
      references: option.scope.references.map((reference) => ({ ...reference }))
    },
    requirements: option.requirements.map((requirement) => ({
      ...requirement
    })),
    exclusions: [...option.exclusions]
  }
}

export function createCommissionDraft(
  title: string,
  location: string,
  option: Prompt2BlogDirectionOption
): Prompt2BlogCommissionDraft {
  const copied = copyDirectionOption(option)
  return {
    schema_version: 3,
    original_title: title,
    location,
    approved_direction: copied.direction,
    form_id: copied.form_id,
    topic_module_ids: copied.topic_module_ids,
    audience: copied.audience,
    core_reader_question: copied.core_reader_question,
    reader_outcome: copied.reader_outcome,
    primary_subject: copied.primary_subject,
    scope: copied.scope,
    requirements: copied.requirements,
    exclusions: copied.exclusions,
    call_to_action: null
  }
}

export function validateCommissionDraft(
  draft: Prompt2BlogCommissionDraft,
  catalog: Prompt2BlogEditorialOptionsResponse
): DirectionImportIssue[] {
  const issues: DirectionImportIssue[] = []
  const record = draft as unknown as Record<string, unknown>
  const allowedKeys = new Set<string>(COMMISSION_KEYS)
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) {
      issues.push({ path: `commission.${key}`, message: 'Unexpected key.' })
    }
  }
  for (const key of COMMISSION_KEYS) {
    if (!(key in record)) {
      issues.push({
        path: `commission.${key}`,
        message: 'Missing required key.'
      })
    }
  }
  if (draft.schema_version !== 3) {
    issues.push({ path: 'commission.schema_version', message: 'Must equal 3.' })
  }
  for (const [key, value] of [
    ['original_title', draft.original_title],
    ['location', draft.location]
  ] as const) {
    if (typeof value !== 'string' || !value.trim()) {
      issues.push({
        path: `commission.${key}`,
        message: 'Must be a non-empty string.'
      })
    }
  }
  if (
    draft.call_to_action !== null &&
    draft.call_to_action !== undefined &&
    typeof draft.call_to_action !== 'string'
  ) {
    issues.push({
      path: 'commission.call_to_action',
      message: 'Must be a string or null.'
    })
  }

  const option: Prompt2BlogDirectionOption = {
    option_id: 'direction-1',
    direction: draft.approved_direction,
    form_id: draft.form_id,
    topic_module_ids: draft.topic_module_ids ?? [],
    audience: draft.audience,
    core_reader_question: draft.core_reader_question,
    reader_outcome: draft.reader_outcome,
    primary_subject: draft.primary_subject,
    scope: draft.scope,
    requirements: draft.requirements,
    exclusions: draft.exclusions ?? [],
    rationale: draft.approved_direction
  }
  issues.push(
    ...validateDirectionOption(option, catalog).map((issue) => ({
      ...issue,
      path: issue.path.replace(/^options\[0\]/, 'commission')
    }))
  )
  return issues
}

function canonicalJson(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'string' || typeof value === 'boolean')
    return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new TypeError('Commission contains a non-finite number.')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`
  }
  throw new TypeError(`Commission contains unsupported ${typeof value} value.`)
}

export async function fingerprintCommission(
  draft: Prompt2BlogCommissionDraft
): Promise<string> {
  const record = draft as unknown as Record<string, unknown>
  const { commission_fingerprint: _ignored, ...payload } = record
  const bytes = new TextEncoder().encode(canonicalJson(payload))
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('')
}

export async function approveCommission(
  draft: Prompt2BlogCommissionDraft,
  catalog: Prompt2BlogEditorialOptionsResponse
): Promise<Prompt2BlogCommission> {
  const issues = validateCommissionDraft(draft, catalog)
  if (issues.length) {
    throw new Error(
      `Invalid commission: ${issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join(' ')}`
    )
  }
  return {
    ...draft,
    topic_module_ids: [...(draft.topic_module_ids ?? [])],
    audience: {
      ...draft.audience,
      tags: [...(draft.audience.tags ?? [])]
    },
    scope: {
      ...draft.scope,
      references: draft.scope.references.map((reference) => ({ ...reference }))
    },
    requirements: draft.requirements.map((requirement) => ({ ...requirement })),
    exclusions: [...(draft.exclusions ?? [])],
    commission_fingerprint: await fingerprintCommission(draft)
  }
}
